/* Header */

'use strict'

const fs = require('fs');
const path = require('path');

const CONFIG = require(path.join(__dirname,'config.json'));

/* */

const crypto = require('crypto');

module.exports = (socket,pgClient) => {
  return {
    // Registers a user
    'register.request': data => {
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

      pgClient.query('SELECT 1 FROM site_user WHERE username = $1',[data.username],(err,usernameTaken) => {
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
                pgClient.query('INSERT INTO site_user (username,password,password_salt,password_iterations) VALUES($1,$2,$3,$4) RETURNING username',[data.username,hash,salt,CONFIG.crypto.password.iterations],
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
    },

    // Signs out a user
    'signout.request': data => {
      delete socket.handshake.session.auth;
      delete socket.handshake.session.username;
      socket.handshake.session.save();

      socket.emit('toastr.success','Signed out');
      socket.emit('signout.response',true);
    },

    // Logs in a user
    'login.request': data => {
      if(typeof data.username !== 'string' || data.username.length === 0){
        socket.emit('toastr.error','Username is required');
        return;
      }

      if(typeof data.password !== 'string' || data.password.length === 0){
        socket.emit('toastr.error','Please enter password');
        return;
      }

      pgClient.query('SELECT * FROM site_user WHERE username = $1 LIMIT 1',[data.username],(err,userInfo) => {
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
    }

    //
  }
};
