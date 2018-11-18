const fs = require('fs');
const path = require('path');

const express = require('express');
const app = express();

const pg = require('pg');
const pgc = new pg.Client(process.env.DB_URL);

const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);

function createTables(){
  const queries = [
    'CREATE TABLE IF NOT EXISTS yt_video (id VARCHAR(11) PRIMARY KEY,category_id VARCHAR(24),category_name TEXT,upload_date TIMESTAMPTZ NOT NULL)',
    'CREATE TABLE IF NOT EXISTS yt_comment (user_id VARCHAR(24) NOT NULL,video_id VARCHAR(11) NOT NULL,comment TEXT NOT NULL,publish_date_list TIMESTAMPTZ )',
    'CREATE TABLE IF NOT EXISTS yt_user (id VARCHAR(24) PRIMARY KEY,num_videos NUMERIC NOT NULL,num_subscribers NUMERIC NOT NULL,num_playlist NUMERIC NOT NULL,creation_date TIMESTAMPTZ NOT NULL)',
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

function destroyTables(){
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

pgc.connect()
//.then(destroyTables()) // Uncomment this if you want to rebuild tables
.then(createTables())
.then(() => {

  // Socket io connection
  io.of('/public',socket => {
    socket.emit('example_message','hello from the backend');
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
