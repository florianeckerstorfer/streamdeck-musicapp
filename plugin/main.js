#!/usr/local/bin/node

const ws = require('ws');
const os = require('os');
const { writeFileSync } = require('fs');
const { execSync } = require('child_process');

const DEBUG = false;

const LOG_FILE_NAME = `/Users/${
  os.userInfo().username
}/Library/Logs/StreamDeck/ec.florian.musicapp.sdPlugin`;

const OSA_GET_PLAYER_STATE = 'tell application "Music" to get player state';
const OSA_SET_PLAYER_STATE = (state) => `tell application "Music" to ${state}`;

function log(...messages) {
  if (!DEBUG) {
    return;
  }
  const time = new Date();
  const timeString =
    time.toLocaleDateString() + ' ' + time.toLocaleTimeString();
  const fullMessage = `${timeString}: ${messages.join(' ')}`;
  console.log(fullMessage);
  writeFileSync(LOG_FILE_NAME, `${fullMessage}\n`, { flag: 'a' });
}

function runOsaScript(script) {
  return execSync(`osascript -e '${script}'`, { encoding: 'utf8' }).trim();
}

var args = process.argv.slice(2);
var inPort = args[1];
var uuid = args[3];
var registerEvent = args[5];

log(JSON.stringify(args));

// Global web socket
var websocket = null;

// Open the web socket to Stream Deck
// Use 127.0.0.1 because Windows needs 300ms to resolve localhost
websocket = new ws('ws://127.0.0.1:' + inPort);

function setState(context, state) {
  if (websocket) {
    var json = {
      event: 'setState',
      context: context,
      payload: {
        state: state,
      },
    };
    websocket.send(JSON.stringify(json));
  }
}

function updatePlayerState(context) {
  const osaPlayerState = runOsaScript(OSA_GET_PLAYER_STATE);
  const currentPlayerState = osaPlayerState === 'playing' ? 1 : 0;
  setState(context, currentPlayerState);
}

websocket.on('open', function () {
  log('onOpen');
  var json = {
    event: registerEvent,
    uuid: uuid,
  };
  websocket.send(JSON.stringify(json));
});

websocket.on('message', function (eventString) {
  const event = JSON.parse(eventString);
  let playerUpdateInterval;
  log('onMessage', JSON.stringify(event));
  if (
    event.event === 'willAppear' &&
    event.action === 'ec.florian.musicapp.playpause'
  ) {
    try {
      updatePlayerState(event.context);
      playerUpdateInterval = setInterval(
        () => updatePlayerState(event.context),
        1000
      );
    } catch (error) {
      log('initPlayerState', 'Error:', JSON.stringify(error));
    }
  } else if (
    event.event === 'willDisappear' &&
    event.action === 'ec.florian.musicapp.playpause' &&
    playerUpdateInterval
  ) {
    clearInterval(playerUpdateInterval);
  } else if (
    event.event === 'keyUp' &&
    event.action === 'ec.florian.musicapp.playpause'
  ) {
    try {
      const osaPlayerState = runOsaScript(OSA_GET_PLAYER_STATE);
      const currentPlayerState = osaPlayerState === 'playing' ? 1 : 0;
      const targetPlayerState = currentPlayerState === 1 ? 0 : 1;
      log(
        'osaPlayerState',
        osaPlayerState,
        'currentPlayerState',
        currentPlayerState,
        'targetPlayerState',
        targetPlayerState
      );
      try {
        runOsaScript(
          OSA_SET_PLAYER_STATE(targetPlayerState ? 'play' : 'pause')
        );
        setState(event.context, targetPlayerState);
      } catch (error) {
        log('setPlayerState', 'Error:', JSON.stringify(error));
      }
    } catch (error) {
      log('getPlayerState', 'Error:', JSON.stringify(error));
    }
  }
});
