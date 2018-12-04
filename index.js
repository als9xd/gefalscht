const CONFIG = {
  crypto: {
    password: {
      hash_bytes: 32,
      salt_bytes: 16,
      iterations: 872791,
    }
  },
  server: {
    secret: 'Change me!',
  },
};

const fs = require('fs');
const path = require('path');

const request = require('request');

const express = require('express');
const exphbs  = require('express-handlebars');
const app = express();

app.set('views', path.join(__dirname,'/public','views'));
app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');

const session = require('express-session')({
  secret: CONFIG.server.secret,
  resave: true,
  saveUninitialized: true
});
app.use(session);

// Auth middlware
const checkAuth = (socket,next) => {
  if (socket.handshake.session && socket.handshake.session.auth === true){
    return next();
  }
  next(new Error('AUTH_ERROR'));
};

const express_socket_io_session = require('express-socket.io-session')(session);

const pg = require('pg');
const pgc = new pg.Client(process.env.DB_URL);

const crypto = require('crypto');

const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);

function createTables(){
  const queries = [
    'CREATE TABLE IF NOT EXISTS yt_video (id VARCHAR(11) PRIMARY KEY,category_id VARCHAR(24),category_name TEXT,upload_date TIMESTAMPTZ NOT NULL)',
    'CREATE TABLE IF NOT EXISTS yt_comment (id VARCHAR(26) PRIMARY KEY,user_id VARCHAR(24) NOT NULL,video_id VARCHAR(11) NOT NULL,original_text TEXT NOT NULL,publish_date_list TIMESTAMPTZ[] )',
    'CREATE TABLE IF NOT EXISTS yt_user (id VARCHAR(26) PRIMARY KEY,title TEXT,thumbnail_url TEXT,num_videos NUMERIC NOT NULL,num_playlists NUMERIC NOT NULL,num_subscribers NUMERIC NOT NULL,num_subscriptions NUMERIC,creation_date TIMESTAMPTZ NOT NULL)',
    'CREATE TABLE IF NOT EXISTS video_audit (id SERIAL PRIMARY KEY,video_id VARCHAR(11) NOT NULL,comments JSONB NOT NULL,audit_date TIMESTAMPTZ NOT NULL, auditor_username TEXT)',
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
      return;
    }
    if(body.error && body.error.errors.length && body.error.errors[0].reason && body.error.errors[0].reason === 'keyInvalid'){
      socket.emit('toastr.error','Invalid YouTube API Key.Follow the quickstart guide <a style="color:blue" href="https://github.com/als9xd/gefalscht">here</a>.');
      return;
    }

    if(!body.items){
      socket.emit('toastr.error','Could not find video');
      return;
    }

    Promise.all(body.items.map(comment =>
      new Promise((resolveComment,rejectComment) => {
        pgc.query('INSERT INTO yt_comment (id,user_id,video_id,original_text,publish_date_list) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET id=yt_comment.id RETURNING *',
        [
          comment.id,
          comment.snippet.topLevelComment.snippet.authorChannelId.value,
          comment.snippet.topLevelComment.snippet.videoId,
          comment.snippet.topLevelComment.snippet.textOriginal,
          [comment.snippet.topLevelComment.snippet.publishedAt,comment.snippet.topLevelComment.snippet.updatedAt],
        ],(err,insertedComment) => {
          if(err) return rejectComment(err);
          request({
            method: 'GET',
            uri: 'https://www.googleapis.com/youtube/v3/channels',
            json: true,
            qs: {
              part:'statistics,snippet',
              id: comment.snippet.topLevelComment.snippet.authorChannelId.value,
              key: process.env.YT_API_KEY,
            }
          },(err,response,body) => {
            if(err) return rejectComment(err);
            Promise.all(
              body.items.map(user =>
                new Promise((resolveUser,rejectUser) => {
                  request({
                    method: 'GET',
                    uri: 'https://www.googleapis.com/youtube/v3/playlists',
                    json: true,
                    qs: {
                      part:'id',
                      channelId: comment.snippet.topLevelComment.snippet.authorChannelId.value,
                      key: process.env.YT_API_KEY,
                    }
                  },(err,response,body) => {
                    if(err) return rejectUser(err);
                    const num_playlists = Number(body.items.length);

                    request({
                      method: 'GET',
                      uri: 'https://www.googleapis.com/youtube/v3/subscriptions',
                      json: true,
                      qs: {
                        part:'id',
                        channelId: comment.snippet.topLevelComment.snippet.authorChannelId.value,
                        key: process.env.YT_API_KEY,
                      }
                    },(err,response,body) => {
                      if(err) return rejectUser(err);
                      const num_subscriptions = response.statusCode === 403?null:Number(body.items.length);

                      pgc.query('INSERT INTO yt_user (id,title,thumbnail_url,num_videos,num_playlists,num_subscribers,num_subscriptions,creation_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET title = $2,thumbnail_url = $3,num_videos = $4,num_playlists = $5,num_subscribers = $6,num_subscriptions = $7,creation_date = $8 RETURNING *',
                      [
                        user.id,
                        user.snippet.title,
                        user.snippet.thumbnails.high.url,
                        Number(user.statistics.videoCount),
                        num_playlists,
                        Number(user.statistics.subscriberCount),
                        num_subscriptions,
                        user.snippet.publishedAt,
                      ], (err,insertedUser) => {
                        if(err) return rejectUser(err);
                        resolveUser(insertedUser);
                      });
                    });

                  });
                })
              )
            )
            .then(insertedUsers => {
              if(!insertedUsers.length){
                return resolveComment();
              }
              resolveComment({
                user: insertedUsers[0].rows[0],
                comment: insertedComment.rows[0],
              });
            });
          });
        });
      })
    ))
    .then(results => {
      const comments = [...results.filter(c=>c!==undefined),...gatheredComments];
      socket.emit('audit.progress',{completed:currPage,total:numPages?numPages:'∞'});
      if(body.nextPageToken && (!numPages || currPage < numPages)){
        getPageComments(videoId,currPage+1,numPages,body.nextPageToken,comments,socket,callback);
      }else{
        callback(comments.reverse());
      }
    });
  });
}

pgc.connect()
//.then(destroyData()) // Uncomment this if you want to remove all data in database
//.then(destroyTables()) // Uncomment this if you want to destory all tables in database
.then(createTables())
.then(() => {

  // Socket io private namespace
  io.of('/private',socket => {
    socket.on('history.request',data => {
      pgc.query('SELECT * FROM video_audit WHERE username = $1',[socket.handshake.session.username],(err,history) => {
        if(err) throw err;
        socket.emit('history.response',history.rows);
      });
    });
  }).use(express_socket_io_session).use(checkAuth);

  // Socket io public namespace
  io.of('/public').use(express_socket_io_session);
  io.of('/public',socket => {

    socket.on('register.request',data => {
      if(typeof data.username !== 'string' || data.username.length === 0){
        socket.emit('toastr.error','Username is required');
        return;
      }

      if(typeof data.password !== 'string' || data.password.length === 0){
        socket.emit('toastr.error','Password is required');
        return;
      }

      if(typeof data.password_confirmation !== 'string' || data.password_confirmation.length === 0){
        socket.emit('toastr.error','Please confirm your password');
        return;
      }

      if(data.password !== data.password_confirmation){
        socket.emit('toastr.error','Passwords do not match');
        return;
      }

      pgc.query('SELECT 1 FROM site_user WHERE username = $1',[data.username],(err,usernameTaken) => {
          if(err) throw err;

          if(typeof usernameTaken === 'undefined' || usernameTaken.rowCount === 1){
            socket.emit('toastr.error','Username already taken');
            return;
          }

          let salt = crypto.randomBytes(CONFIG.crypto.password.salt_bytes).toString('base64');
          crypto.pbkdf2(data.password, salt, CONFIG.crypto.password.iterations, CONFIG.crypto.password.hash_bytes,'sha256',
            (err,hash) => {
              if(err) throw err;
              else {
                pgc.query('INSERT INTO site_user (username,password,password_salt,password_iterations) VALUES($1,$2,$3,$4) RETURNING username',[data.username,hash,salt,CONFIG.crypto.password.iterations],
                  (err,userName) => {
                    if(err) throw err;
                    socket.handshake.session.auth = true;
                    socket.handshake.session.username = userName.rows[0].username;
                    socket.handshake.session.save();

                    socket.emit('toastr.success',`Successfully registered as "${data.username}"`);
                    socket.emit('register.response',true);
                  }
                );
              }
            }
          );
      });
    });
    socket.on('signout.request',() => {
      delete socket.handshake.session.auth;
      delete socket.handshake.session.username;
      socket.handshake.session.save();
      
      socket.emit('toastr.success','Signed out');
      socket.emit('signout.response',true);
    });

    socket.on('login.request',data => {
      if(typeof data.username !== 'string' || data.username.length === 0){
        socket.emit('toastr.error','Username is required');
        return;
      }

      if(typeof data.password !== 'string' || data.password.length === 0){
        socket.emit('toastr.error','Please enter password');
        return;
      }

      pgc.query('SELECT * FROM site_user WHERE username = $1 LIMIT 1',[data.username],(err,userInfo) => {
        if(err) throw err;
        else if(userInfo && userInfo.rows.length){
          crypto.pbkdf2(
            data.password,
            userInfo.rows[0].password_salt,
            Number(userInfo.rows[0].password_iterations),
            userInfo.rows[0].password.length,
            'sha256',
            (err,hashStr) => {
              if(err) throw err;
              else if(userInfo.rows[0].password.equals(hashStr)){

                socket.handshake.session.auth = true;
                socket.handshake.session.username = userInfo.rows[0].username;
                socket.handshake.session.save();

                socket.emit('toastr.success','Logged in');
                socket.emit('login.response',true);
              }else{
                socket.emit('toastr.error','Invalid username or password');
              }
            }
          );
        }else{
          socket.emit('toastr.error','Username not found');
        }
      });
    });

    socket.on('audit.request',data => {
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

      socket.emit('audit.progress',{completed:0,total:pages?pages:'∞'});
      getPageComments(videoId,1,pages,null,[],socket,comments => {
        if(socket.handshake.session.auth === true){
          pgc.query('INSERT INTO video_audit (video_id,comments,audit_date,auditor_username) VALUES($1,$2,$3,$4)',[videoId,JSON.stringify(comments),new Date(),socket.handshake.session.username],(err) => {
            if(err) throw err;
          });
        }

        socket.emit('audit.response',comments);
      });

    });
  });

  // Bootstrap files
  app.get('/js/bootstrap.min.js',(req,res) => { res.sendFile(path.join(__dirname,'/node_modules/bootstrap/dist/js/bootstrap.min.js')); });
  app.get('/css/bootstrap.min.css',(req,res) => { res.sendFile(path.join(__dirname,'/node_modules/bootstrap/dist/css/bootstrap.min.css')); });

  // jQuery files
  app.get('/js/jquery.min.js',(req,res) => { res.sendFile(path.join(__dirname,'/node_modules/jquery/dist/jquery.min.js')); });

  // Loading-bar
  app.get('/js/loading-bar.js',(req,res) => { res.sendFile(path.join(__dirname,'/public/vender/loading-bar/loading-bar.js')); });
  app.get('/css/loading-bar.css',(req,res) => { res.sendFile(path.join(__dirname,'/public/vender/loading-bar/loading-bar.css')); });

  // Toastr popup notifications
  app.get('/js/toastr.min.js',(req,res) => { res.sendFile(path.join(__dirname,'/node_modules/toastr/build/toastr.min.js')); });
  app.get('/css/toastr.min.css',(req,res) => { res.sendFile(path.join(__dirname,'/node_modules/toastr/build/toastr.min.css')); });

  // Main CSS file
  app.get('/css/styles.css',(req,res) => { res.sendFile(path.join(__dirname,'public','css','styles.css')); });

  app.get('/', (req,res) => {
    res.render('index',{auth:req.session.auth,username:req.session.username});
  });

  server.listen(process.env.PORT,()=>{
    console.log(`Listening on port ${process.env.PORT}`);
  });
});
