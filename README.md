# Requirements

1. [Docker](https://docs.docker.com/install/)
2. [YouTube API key](https://developers.google.com/youtube/v3/getting-started)

# How to start

1. Create your YouTube API key if you don't have one already [here](https://developers.google.com/youtube/v3/getting-started)
2. Update `docker-compose.yml` with your YouTube API key
3. Within repository base directory run `docker-compose up --build` ( You may have to run it twice if it doesn't work the first time )

# Important files

* `index.js` - Main backend server file
* `public/index.html` - Main HTML file
* `public/css/styles.css` - Main CSS file
