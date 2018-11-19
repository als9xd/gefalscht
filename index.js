const fs = require('fs');
const path = require('path');

const request = require('request');

const express = require('express');
const app = express();

const pg = require('pg');
const pgc = new pg.Client(process.env.DB_URL);

const crypto = require('crypto');

const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);

function createTables(){
  const queries = [
    'CREATE TABLE IF NOT EXISTS yt_video (id VARCHAR(11) PRIMARY KEY,category_id VARCHAR(24),category_name TEXT,upload_date TIMESTAMPTZ NOT NULL)',
    'CREATE TABLE IF NOT EXISTS yt_comment (id VARCHAR(26) PRIMARY KEY,user_id VARCHAR(24) NOT NULL,video_id VARCHAR(11) NOT NULL,comment TEXT NOT NULL,publish_date_list TIMESTAMPTZ[] )',
    'CREATE TABLE IF NOT EXISTS yt_user (id VARCHAR(26) PRIMARY KEY,num_videos NUMERIC NOT NULL,num_subscribers NUMERIC NOT NULL,num_playlist NUMERIC NOT NULL,creation_date TIMESTAMPTZ NOT NULL)',
    'CREATE TABLE IF NOT EXISTS video_audit (video_id VARCHAR(11) NOT NULL,num_bots NUMERIC,num_comments NUMERIC,audit_date TIMESTAMPTZ NOT NULL, auditor_username TEXT)',
    // "user" is reserved word
    'CREATE TABLE IF NOT EXISTS site_user (username TEXT UNIQUE NOT NULL,password BYTEA NOT NULL,password_salt VARCHAR(24) NOT NULL,password_iterations NUMERIC NOT NULL)',
  ];

  return Promise.all(
    queries.map(query =>
      new Promise((resolve,reject) => {
        pgc.query(query,[],err => {
          if(err) reject(err);
          resolve();
        });
      })
    )
  );
}

function destroyData(){
  const queries = [
    'TRUNCATE yt_video',
    'TRUNCATE yt_comment',
    'TRUNCATE yt_user',
    'TRUNCATE video_audit',
    'TRUNCATE site_user',
  ];

  return Promise.all(
    queries.map(query =>
      new Promise((resolve,reject) => {
        pgc.query(query,[],err => {
          if(err) reject(err);
          resolve();
        });
      })
    )
  );
}

function destroyTables(){
  const queries = [
    'DROP TABLE yt_video',
    'DROP TABLE yt_comment',
    'DROP TABLE yt_user',
    'DROP TABLE video_audit',
    'DROP TABLE site_user',
  ];

  return Promise.all(
    queries.map(query =>
      new Promise((resolve,reject) => {
        pgc.query(query,[],err => {
          if(err) reject(err);
          resolve();
        });
      })
    )
  );
}

function getPageComments(videoId,currPage,numPages,nextPageToken,gatheredComments,socket,callback){
  request({
    method: 'GET',
    uri: 'https://www.googleapis.com/youtube/v3/commentThreads',
    json: true,
    qs: {
      part:'snippet',
      videoId,
      key: process.env.YT_API_KEY,
      pageToken: nextPageToken,
    }
  },(err,response,body) => {
    if(err){
      console.error(error);
      socket.emit('get_comments.error',error);
      return;
    }
    Promise.all(body.items.map(comment =>
      new Promise((resolveComment,rejectComment) => {
        pgc.query('INSERT INTO yt_comment (id,user_id,video_id,comment,publish_date_list) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET id=yt_comment.id RETURNING *',
        [
          comment.id,
          comment.snippet.topLevelComment.snippet.authorChannelId.value,
          comment.snippet.topLevelComment.snippet.videoId,
          comment.snippet.topLevelComment.snippet.textOriginal,
          [comment.snippet.topLevelComment.snippet.publishedAt,comment.snippet.topLevelComment.snippet.updatedAt],
        ],(err,results) => {
          if(err) return rejectComment(err);
          resolveComment(results);
        });
      })
    ))
    .then(results => {
      const comments = [...results.map(r=>r.rows[0]),...gatheredComments];
      socket.emit('audit.progress',{completed:currPage,total:numPages?numPages:'∞'});
      if(body.nextPageToken && (!numPages || currPage < numPages)){
        getPageComments(videoId,currPage+1,numPages,response.nextPageToken,comments,socket,callback);
      }else{
        callback(comments);
      }
    });
  });
}

pgc.connect()
//.then(destroyData()) // Uncomment this if you want to remove all data in database
//.then(destroyTables()) // Uncomment this if you want to destory all tables in database
.then(createTables())
.then(() => {

  // Socket io connection
  io.of('/public',socket => {
    socket.on('audit.request',data => {
      const { url,pages } = data;

      const videoId = url.slice(-11);

      getPageComments(videoId,1,Number(pages),null,[],socket,comments => {
        socket.emit('audit.response',comments);
      });

    });
  });

  // Bootstrap files
  app.get('/js/bootstrap.min.js',(req,res) => { res.sendFile(path.join(__dirname,'/node_modules/bootstrap/dist/js/bootstrap.min.js')); });
  app.get('/css/bootstrap.min.css',(req,res) => { res.sendFile(path.join(__dirname,'/node_modules/bootstrap/dist/css/bootstrap.min.css')); });

  // jQuery files
  app.get('/js/jquery.min.js',(req,res) => { res.sendFile(path.join(__dirname,'/node_modules/jquery/dist/jquery.min.js')); });

  // Main CSS file
  app.get('/css/styles.css',(req,res) => { res.sendFile(path.join(__dirname,'public','css','styles.css')); });

  app.get('/', (req,res) => {
    res.sendFile(path.join(__dirname,'public','index.html'));
  });

  server.listen(process.env.PORT,()=>{
    console.log(`Listening on port ${process.env.PORT}`);
  });
});
