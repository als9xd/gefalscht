const moment = require('moment');

module.exports = (comments,settings) => {

  // User account creation date

  if(settings.creation_date[0] !== ''){
    comments = comments.map(comment => {
      return {
        ...comment,
        isBot: comment.isBot !== false && moment(comment.user.creation_date) >= moment(settings.creation_date[0],'YYYY').utc()
      };
    });
  }

  if(settings.creation_date[1] !== ''){
    comments = comments.map(comment => {
      return {
        ...comment,
        isBot: comment.isBot !== false && moment(comment.user.creation_date) < moment(settings.creation_date[1],'YYYY').utc()
      };
    });
  }

  // Number of subscribers

  if(settings.num_subscribers[0] !== ''){
    comments = comments.map(comment => {
      return {
        ...comment,
        isBot: comment.isBot !== false && Number(comment.user.num_subscribers) >= Number(settings.num_subscribers[0])
      };
    });
  }

  if(settings.num_subscribers[1] !== ''){
    comments = comments.map(comment => {
      return {
        ...comment,
        isBot: comment.isBot !== false && Number(comment.user.num_subscribers) <= Number(settings.num_subscribers[1])
      };
    });
  }

  // Number of uploaded videos

  if(settings.num_videos[0] !== ''){
    comments = comments.map(comment => {
      return {
        ...comment,
        isBot: comment.isBot !== false && Number(comment.user.num_videos) >= Number(settings.num_videos[0])
      };
    });
  }

  if(settings.num_videos[1] !== ''){
    comments = comments.map(comment => {
      return {
        ...comment,
        isBot: comment.isBot !== false && Number(comment.user.num_videos) <= Number(settings.num_videos[1])
      };
    });
  }

  // Number of saved playlists

  if(settings.num_playlists[0] !== ''){
    comments = comments.map(comment => {
      return {
        ...comment,
        isBot: comment.isBot !== false && Number(comment.user.num_playlists) >= Number(settings.num_playlists[0])
      };
    });
  }

  if(settings.num_playlists[1] !== ''){
    comments = comments.map(comment => {
      return {
        ...comment,
        isBot: comment.isBot !== false && Number(comment.user.num_playlists[0]) <= Number(settings.num_playlists[1])
      };
    });
  }

  // Number of subscribers

  if(settings.num_subscribers[0] !== ''){
    comments = comments.map(comment => {
      return {
        ...comment,
        isBot: comment.isBot !== false && Number(comment.user.num_subscribers) >= Number(settings.num_subscribers[0])
      };
    });
  }

  if(settings.num_subscribers[1] !== ''){
    comments = comments.map(comment => {
      return {
        ...comment,
        isBot: comment.isBot !== false && Number(comment.user.num_subscribers) <= Number(settings.num_subscribers[1])
      };
    });
  }

  // Number of subscriptions

  if(settings.num_subscriptions[0] !== ''){
    comments = comments.map(comment => {
      return {
        ...comment,
        isBot: comment.isBot !== false && Number(comment.user.num_subscriptions) >= Number(settings.num_subscriptions[0])
      };
    });
  }

  if(settings.num_subscriptions[1] !== ''){
    comments = comments.map(comment => {
      return {
        ...comment,
        isBot: comment.isBot !== false && Number(comment.user.num_subscriptions) <= Number(settings.num_subscriptions[1])
      };
    });
  }

  return comments;
}
