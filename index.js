/* Header */

'use strict'

const fs = require('fs');
const path = require('path');

const CONFIG = require(path.join(__dirname,'config.json'));

/* */

const request = require('request');

const http = require('http');
const express = require('express');
const exphbs  = require('express-handlebars');
const app = express();

// Handlebars Setup
app.set('view options', { layout: 'main' });
app.set('views', path.join(__dirname,'/public','views'));
app.engine('handlebars', exphbs({
  defaultLayout: 'main',
  layoutsDir: 'public/views/layouts'
}));
app.set('view engine', 'handlebars');

// Express Session  setup

const session = require('express-session')({
  secret: CONFIG.server.secret,
  resave: true,
  saveUninitialized: true
});

app.use(session);

// Socket.io Authentication Middlware
const checkAuth = (socket,next) => {
  if (socket.handshake.session && socket.handshake.session.auth === true){
    return next();
  }
  next(new Error('AUTH_ERROR'));
};

const express_socket_io_session = require('express-socket.io-session')(session);

const server = http.createServer(app);
const io = require('socket.io')(server);

const PGClient = require(path.join(__dirname,'PGClient.js'));
const pgc = new PGClient(process.env.DB_URL);

pgc.connect()
//.then(destroyData()) // Uncomment this if you want to remove all data in database
//.then(destroyTables()) // Uncomment this if you want to destory all tables in database
.then(pgc.init())
.then(() => {

  // Socket io private namespace
  const private_ns = io.of('/private',socket => {
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

    // Setup Authentication Listeners
    const authListeners = require(path.join(__dirname,'authListeners.js'))(socket,pgc);
    Object.keys(authListeners).forEach(eventName => {
      socket.on(eventName,authListeners[eventName]);
    })

    // Setup Authentication Listeners
    const videoAuditListeners = require(path.join(__dirname,'videoAuditListeners.js'))(socket,pgc);
    Object.keys(videoAuditListeners).forEach(eventName => {
      socket.on(eventName,videoAuditListeners[eventName]);
    })

  });

  /* Express Routes */

  // Bootstrap files
  app.get('/js/bootstrap.min.js',(req,res) => { res.sendFile(path.join(__dirname,'/node_modules/bootstrap/dist/js/bootstrap.min.js')); });
  app.get('/css/bootstrap.min.css',(req,res) => { res.sendFile(path.join(__dirname,'/node_modules/bootstrap/dist/css/bootstrap.min.css')); });

  app.get('/vender/bootswatch.min.css',(req,res) => { res.sendFile(path.join(__dirname,'/public/vender/bootswatch.min.css')); });
  app.get('/robot.gif',(req,res) => { res.sendFile(path.join(__dirname,'/public/robot.gif')); });

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

  app.get('/',(req,res) => {
    res.redirect('home');
  });

  app.get('/home', (req,res) => {
    pgc.query('SELECT a.* FROM yt_video a INNER JOIN ( SELECT video_id, COUNT(*) TotalCount FROM video_audit GROUP BY video_audit.video_id ) b ON a.id = b.video_id ORDER BY b.TotalCount DESC,a.id ASC LIMIT 4',(err,trendingVideos) => {
      if(err) throw err;
      if(req.session.auth){
        pgc.query('SELECT *,video_audit.id as audit_id FROM video_audit INNER JOIN yt_video ON video_audit.video_id = yt_video.id WHERE auditor_username = $1 LIMIT 5',[req.session.username],(err,history) => {
          if(err) throw err;
          res.render('home',{homeTab:true,auth:req.session.auth,username:req.session.username,history:history.rows,trendingVideos:trendingVideos.rows});
        });
      }else{
        res.render('home',{homeTab:true,auth:req.session.auth,username:req.session.username,trendingVideos:trendingVideos.rows});
      }
    });
  });

  app.get('/trends',(req,res) => {
    pgc.query('SELECT a.* FROM yt_video a INNER JOIN ( SELECT video_id, COUNT(*) TotalCount FROM video_audit GROUP BY video_audit.video_id ) b ON a.id = b.video_id ORDER BY b.TotalCount DESC,a.id ASC LIMIT 4',(err,trendingVideos) => {
      if(err) throw err;
      pgc.query('SELECT auditor_username,audit_date FROM video_audit',(err,videoAudits) => {
        const stringifiedAudit = encodeURIComponent(JSON.stringify(videoAudits.rows));
        res.render('trends',{trendsTab:true,auth:req.session.auth,username:req.session.username,videoAudits:stringifiedAudit,trendingVideos:trendingVideos.rows});
      });
    });
  });

  server.listen(process.env.PORT,()=>{
    console.log(`Listening on port ${process.env.PORT}`);
  });
});
