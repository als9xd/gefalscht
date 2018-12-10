/* Header */

'use strict'

const fs = require('fs');
const path = require('path');

const CONFIG = require(path.join(__dirname,'config.json'));

/* */

const pg = require('pg');

class PGClient {
  constructor(url){
    this.url = url;
    this.pgc = new pg.Client(process.env.DB_URL);
  }

  query(...args){
    return this.pgc.query(...args);
  }

  connect(){
    return this.pgc.connect();
  }

  init(){
    const queries = [
      'CREATE TABLE IF NOT EXISTS yt_video (id VARCHAR(11) PRIMARY KEY,title TEXT,thumbnail_url TEXT,category_id VARCHAR(24),tags TEXT[],upload_date TIMESTAMPTZ NOT NULL)',
      'CREATE TABLE IF NOT EXISTS yt_comment (id VARCHAR(26) PRIMARY KEY,user_id VARCHAR(24) NOT NULL,video_id VARCHAR(11) NOT NULL,original_text TEXT NOT NULL,publish_date_list TIMESTAMPTZ[] )',
      'CREATE TABLE IF NOT EXISTS yt_user (id VARCHAR(26) PRIMARY KEY,title TEXT,thumbnail_url TEXT,num_videos NUMERIC NOT NULL,num_playlists NUMERIC NOT NULL,num_subscribers NUMERIC NOT NULL,num_subscriptions NUMERIC,creation_date TIMESTAMPTZ NOT NULL)',
      'CREATE TABLE IF NOT EXISTS video_audit (id SERIAL PRIMARY KEY,video_id VARCHAR(11) NOT NULL,comments JSONB NOT NULL,audit_date TIMESTAMPTZ NOT NULL, auditor_username TEXT)',
      // "user" is reserved word
      'CREATE TABLE IF NOT EXISTS site_user (username TEXT UNIQUE NOT NULL,password BYTEA NOT NULL,password_salt VARCHAR(24) NOT NULL,password_iterations NUMERIC NOT NULL)',
    ];

    return Promise.all(
      queries.map(query =>
        new Promise((resolve,reject) => {
          this.pgc.query(query,[],err => {
            if(err) reject(err);
            resolve();
          });
        })
      )
    );
  }

  drop(){
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
          this.pgc.query(query,[],err => {
            if(err) reject(err);
            resolve();
          });
        })
      )
    );
  }

  truncate(){
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
          this.pgc.query(query,[],err => {
            if(err) reject(err);
            resolve();
          });
        })
      )
    );
  }

}

module.exports = PGClient;
