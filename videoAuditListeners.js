/* Header */

'use strict'

const fs = require('fs');
const path = require('path');

const CONFIG = require(path.join(__dirname,'config.json'));

/* */

const botFilter = require(path.join(__dirname,'botFilter.js'));

const YTInterface = require(path.join(__dirname,'YTInterface.js'));
const ytInterface = new YTInterface(process.env.YT_API_KEY);

const rp = require('request-promise');

module.exports = (socket,pgClient) => {
  return {

    'audit_averages.request': (settings) => {
      pgClient.query('SELECT DISTINCT ON(video_id) video_id,comments FROM video_audit',(err,results) => {
        if(err) throw err;
        let totalBots = 0;
        let totalHumans = 0;
        for(let i = 0; i < results.rows.length;i++){
          const comments = botFilter(results.rows[i].comments,settings);
          for(let j = 0; j < comments.length;j++){
            const comment = comments[j];
            if(comment.isBot) totalBots++;
            else totalHumans++;
          }
        }
        socket.emit('audit_averages.response',{
          totalBots:totalBots/results.rows.length,
          totalHumans:totalHumans/results.rows.length,
        });
      });
    },

    // Audit a video
    'audit.request': (data) => {

      // If it is an existing audit
      if(typeof data.auditId !== 'undefined'){
        return new Promise((resolve,reject) => {
          pgClient.query('SELECT * FROM video_audit WHERE id = $1 LIMIT 1',[data.auditId],(err,results) => {
            if(err) return reject(err);
            if(!results.rows.length){
              socket.emit('toastr.error',`Could not find audit with id "${data.auditId}"`);
            }
            const { id, comments } = results.rows[0];
            const filteredComments = botFilter(comments,data.settings);
            socket.emit('audit.response',{id,comments:filteredComments});
            resolve({id,comments:filteredComments});
          });
        });
      }

      // Otherwise create a new audit
      let { url,pages } = data;

      pages = Number(pages);
      if(isNaN(pages)){
        socket.emit('toastr.error','Invalid number of pages');
        return;
      }

      url = url.trim();
      let videoId = null;

      if(url.length === 11){
        if(!url.match(/^[a-z0-9]{11}$/)){
          socket.emit('toastr.error','Invalid video id');
          return;
        }
        videoId = url;
      }else{
        const match = url.match(/^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/);
        videoId = (match&&match[7].length==11)? match[7] : null;
        if(!videoId){
          socket.emit('toastr.error','Invalid video url');
          return;
        }
      }

      return rp({
        method: 'GET',
        uri: 'https://www.googleapis.com/youtube/v3/videos',
        json: true,
        qs: {
          part: 'snippet',
          id: videoId,
          key: process.env.YT_API_KEY,
        }
      })
      .then((body) => new Promise((resolve,reject) => {
        if(body.error && body.error.errors.length && body.error.errors[0].reason && body.error.errors[0].reason === 'keyInvalid'){
          return reject(new Error('Invalid YouTube API Key.Follow the quickstart guide <a style="color:blue" href="https://github.com/als9xd/gefalscht">here</a>.'));
        }

        const foundVideos = body.items;

        if(!foundVideos){
          socket.emit('toastr.error','Could not find video');
          return;
        }

        pgClient.query('INSERT INTO yt_video (id,title,thumbnail_url,tags,upload_date) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET title = $2,thumbnail_url = $3, tags = $4, upload_date = $5',
        [videoId,body.items[0].snippet.title,body.items[0].snippet.thumbnails.high.url,body.items[0].snippet.tags,body.items[0].snippet.publishedAt],(err) => {
          if(err) reject(err);
          resolve();
        });
      }))
      // Get all the comments
      .then(() => ytInterface.getPageComments(videoId))
      // Store each comment into db
      .then((results) =>{
        let pagesRetrieved = 0;
        let currentComment = 0;
        function _getPageComments(lastPageComments,nextPageToken){
          if(!nextPageToken || (data.pages && ++pagesRetrieved > data.pages)) return Promise.resolve(lastPageComments);
          return ytInterface.getPageComments(videoId,nextPageToken)
          .then((results) => {
            const { comments, nextPageToken} = results;
            return Promise.all(
              comments.map((comment) =>
                new Promise((resolve,reject) => {
                  pgClient.query('INSERT INTO yt_comment (id,user_id,video_id,original_text,publish_date_list) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET id=yt_comment.id RETURNING *',
                  [
                   comment.id,
                   comment.snippet.topLevelComment.snippet.authorChannelId.value,
                   comment.snippet.topLevelComment.snippet.videoId,
                   comment.snippet.topLevelComment.snippet.textOriginal,
                   [comment.snippet.topLevelComment.snippet.publishedAt,comment.snippet.topLevelComment.snippet.updatedAt],
                 ],(err,results) => {
                   if(err) reject(err);
                   socket.emit('audit.progress',{currentComment:++currentComment,totalComments:data.pages?20*data.pages:'∞'});
                   resolve({comments:results.rows[0],nextPageToken});
                 });
                })
              )
            );
          })
          .then((results) => {
            const comments = results.map(c=>c.comments);
            const nextPageToken = results.map(c=>c.nextPageToken)[0];
            if(pagesRetrieved===1) lastPageComments = [];
            return _getPageComments([...comments,...lastPageComments],nextPageToken);
          });
        }

        return _getPageComments(results.comments,results.nextPageToken);
      })
      // Store each comment's user info db
      .then((comments) => {
        let currentUser = 0;
        return Promise.all(
          comments.map((comment) =>
            Promise.all(
              [
                ytInterface.getChannelInfo(comment.user_id),
                ytInterface.getChannelPlaylists(comment.user_id),
                ytInterface.getChannelSubscriptions(comment.user_id),
              ]
            )
            .then((channel) => new Promise((resolve,reject) => {
              const info = channel[0];
              const playlists = channel[1];
              const subscriptions = channel[2];

              pgClient.query(`
                INSERT INTO yt_user (id,title,thumbnail_url,num_videos,num_playlists,num_subscribers,num_subscriptions,creation_date)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT(id) DO UPDATE SET title = $2,thumbnail_url = $3,num_videos = $4,num_playlists = $5,num_subscribers = $6,num_subscriptions = $7,creation_date = $8
                RETURNING *`,
                [
                  info.id,
                  info.title,
                  info.thumbnails.high.url,
                  Number(info.videoCount),
                  playlists.length,
                  Number(info.subscriberCount),
                  subscriptions.length,
                  info.publishedAt,
                ],
                (err,results) => {
                  if(err) reject(err);
                  socket.emit('audit.progress',{currentUser:++currentUser,totalUsers:comments.length});
                  resolve({comment,user:results.rows[0]});
                }
              );
            }))
          )
        )
      })
      // Store a snapshot of the audit into the db
      .then((comments) =>
        new Promise((resolve,reject) => {
          pgClient.query('INSERT INTO video_audit (video_id,comments,audit_date,auditor_username) VALUES($1,$2,$3,$4) RETURNING id',[videoId,JSON.stringify(comments),new Date(),socket.handshake.session.auth?socket.handshake.session.username:null],(err,results) => {
            if(err) throw err;
            resolve({id:results.rows[0].id,comments});
          });
        })
      )
      // Filter bots
      .then((results) => {
        const {id,comments} = results;
        const filteredComments = botFilter(results.comments,data.settings);
        socket.emit('audit.response',{id,comments:filteredComments});
        return Promise.resolve({id,comments:filteredComments});
      });

    }

    //
  }
};
