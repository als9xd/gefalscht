/* Header */

'use strict'

const fs = require('fs');
const path = require('path');

const CONFIG = require(path.join(__dirname,'config.json'));

/* */

const rp = require('request-promise');

class YTInterface {
  constructor(api_key){
    if(typeof api_key === 'undefined') throw new Error('Must pass a YouTube API key to constructor');

    this.api_key = api_key;
  }

  getPageComments(videoId,pageToken){
    return rp({
      method: 'GET',
      uri: 'https://www.googleapis.com/youtube/v3/commentThreads',
      json: true,
      qs: {
        part:'snippet',
        videoId,
        key: this.api_key,
        pageToken: pageToken,
      }
    })
    .then((response) => {
      return Promise.resolve(response.items);
    });
  }

  getChannelInfo(authorChannelId){
    return rp({
      method: 'GET',
      uri: 'https://www.googleapis.com/youtube/v3/channels',
      json: true,
      qs: {
        part:'statistics,snippet',
        id: authorChannelId,
        key: this.api_key,
      }
    })
    .then((response) => {
      if(!response.items.length) return Promise.resolve(null);
      return Promise.resolve({
        id:response.items[0].id,
        ...response.items[0].snippet,
        ...response.items[0].statistics
      });
    });
  }

  getChannelPlaylists(authorChannelId){
    return rp({
      method: 'GET',
      uri: 'https://www.googleapis.com/youtube/v3/playlists',
      json: true,
      qs: {
        part:'id',
        channelId: authorChannelId,
        key: this.api_key,
      }
    })
    .then((response) => {
      return Promise.resolve(response.items.map(p=>p.id));
    });
  }

  getChannelSubscriptions(authorChannelId){
    return rp({
      method: 'GET',
      uri: 'https://www.googleapis.com/youtube/v3/subscriptions',
      json: true,
      qs: {
        part:'id',
        channelId: authorChannelId,
        key: this.api_key,
      }
    })
    .then((response) => {
      return Promise.resolve(response.items);
    })
    .catch((err) => {
      // In case subscriptions are hidden by user
      if(err.statusCode !== 403) throw err;
      return Promise.resolve([]);
    });
  }


  //
  // getComments(videoId,currPage,numPages,nextPageToken,gatheredComments,socket,callback){
  //   request({
  //     method: 'GET',
  //     uri: 'https://www.googleapis.com/youtube/v3/commentThreads',
  //     json: true,
  //     qs: {
  //       part:'snippet',
  //       videoId,
  //       key: process.env.YT_API_KEY,
  //       pageToken: nextPageToken,
  //     }
  //   },(err,response,body) => {
  //     if(err){
  //       console.error(error);
  //       return;
  //     }
  //     if(body.error && body.error.errors.length && body.error.errors[0].reason && body.error.errors[0].reason === 'keyInvalid'){
  //       socket.emit('toastr.error','Invalid YouTube API Key.Follow the quickstart guide <a style="color:blue" href="https://github.com/als9xd/gefalscht">here</a>.');
  //       return;
  //     }
  //
  //     if(!body.items){
  //       socket.emit('toastr.error','Could not find video');
  //       return;
  //     }
  //
  //     Promise.all(body.items.map(comment =>
  //       new Promise((resolveComment,rejectComment) => {
  //         pgClient.query('INSERT INTO yt_comment (id,user_id,video_id,original_text,publish_date_list) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET id=yt_comment.id RETURNING *',
  //         [
  //           comment.id,
  //           comment.snippet.topLevelComment.snippet.authorChannelId.value,
  //           comment.snippet.topLevelComment.snippet.videoId,
  //           comment.snippet.topLevelComment.snippet.textOriginal,
  //           [comment.snippet.topLevelComment.snippet.publishedAt,comment.snippet.topLevelComment.snippet.updatedAt],
  //         ],(err,insertedComment) => {
  //           if(err) return rejectComment(err);
  //           request({
  //             method: 'GET',
  //             uri: 'https://www.googleapis.com/youtube/v3/channels',
  //             json: true,
  //             qs: {
  //               part:'statistics,snippet',
  //               id: comment.snippet.topLevelComment.snippet.authorChannelId.value,
  //               key: process.env.YT_API_KEY,
  //             }
  //           },(err,response,body) => {
  //             if(err) return rejectComment(err);
  //             Promise.all(
  //               body.items.map(user =>
  //                 new Promise((resolveUser,rejectUser) => {
  //                   request({
  //                     method: 'GET',
  //                     uri: 'https://www.googleapis.com/youtube/v3/playlists',
  //                     json: true,
  //                     qs: {
  //                       part:'id',
  //                       channelId: comment.snippet.topLevelComment.snippet.authorChannelId.value,
  //                       key: process.env.YT_API_KEY,
  //                     }
  //                   },(err,response,body) => {
  //                     if(err) return rejectUser(err);
  //                     const num_playlists = Number(body.items.length);
  //
  //                     request({
  //                       method: 'GET',
  //                       uri: 'https://www.googleapis.com/youtube/v3/subscriptions',
  //                       json: true,
  //                       qs: {
  //                         part:'id',
  //                         channelId: comment.snippet.topLevelComment.snippet.authorChannelId.value,
  //                         key: process.env.YT_API_KEY,
  //                       }
  //                     },(err,response,body) => {
  //                       if(err) return rejectUser(err);
  //                       const num_subscriptions = response.statusCode === 403?null:Number(body.items.length);
  //
  //                       pgClient.query('INSERT INTO yt_user (id,title,thumbnail_url,num_videos,num_playlists,num_subscribers,num_subscriptions,creation_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET title = $2,thumbnail_url = $3,num_videos = $4,num_playlists = $5,num_subscribers = $6,num_subscriptions = $7,creation_date = $8 RETURNING *',
  //                       [
  //                         user.id,
  //                         user.snippet.title,
  //                         user.snippet.thumbnails.high.url,
  //                         Number(user.statistics.videoCount),
  //                         num_playlists,
  //                         Number(user.statistics.subscriberCount),
  //                         num_subscriptions,
  //                         user.snippet.publishedAt,
  //                       ], (err,insertedUser) => {
  //                         if(err) return rejectUser(err);
  //                         resolveUser(insertedUser);
  //                       });
  //                     });
  //
  //                   });
  //                 })
  //               )
  //             )
  //             .then(insertedUsers => {
  //               if(!insertedUsers.length){
  //                 return resolveComment();
  //               }
  //               resolveComment({
  //                 user: insertedUsers[0].rows[0],
  //                 comment: insertedComment.rows[0],
  //               });
  //             });
  //           });
  //         });
  //       })
  //     ))
  //     .then(results => {
  //       const comments = [...results.filter(c=>c!==undefined),...gatheredComments];
  //       socket.emit('audit.progress',{completed:currPage,total:numPages?numPages:'∞'});
  //       if(body.nextPageToken && (!numPages || currPage < numPages)){
  //         getPageComments(videoId,currPage+1,numPages,body.nextPageToken,comments,socket,callback);
  //       }else{
  //         callback(comments.reverse());
  //       }
  //     });
  //   });
  // }

}

module.exports = YTInterface;
