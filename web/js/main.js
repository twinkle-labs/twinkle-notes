/*    
 * Copyright (C) 2020, Twinkle Labs, LLC.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

function websocketURLFromPath(path) {
    if (window.location.protocol === 'https:') {
        return 'wss://' + window.location.host + path;
    } else {
        return 'ws://' + window.location.host + path;
    }
}

window.app = {
    version: '20200112',
    config: null,
    key: null,
    mux: null,
    workspace: null,
    logMessages: [],
    logMessageId: 0,
    echoTimer: null,
    sounds: {
        error: new Audio("/snd/error.mp3")
    },
    playSound: function(x) {
        if (!app.sounds[x]) {
            app.sounds[x] = new Audio("/snd/"+x+".mp3");
        }
        app.sounds[x].play();
    },
    addLog: function(type, x) {
        const MAXCOUNT = 100;
        console.log(type + ": " + x);
        var el = document.getElementById('echo-message');
        el.textContent = x || 'Unknown error';
        if (type == 'error') {
            el.classList.add('echo-danger');
        } else {
            el.classList.remove('echo-danger');
        }

        if (app.echoTimer) clearTimeout(app.echoTimer);
        app.echoTimer = setTimeout(function() {
            el.textContent = '';
            app.echoTimer = null;
        }, 8000);
        
        if (app.logMessages.length > MAXCOUNT) {
            app.logMessages.splice(0, MAXCOUNT/2);
        }
        app.logMessages.push({
            id: ++app.logMessageId,
            type: type,
            time: unixtime(),
            message: x
        });
    },
    echo: function(x) {
        app.addLog('info', x);
    },
    err: function(x) {
        app.addLog('error', x);
    },
    getSavedKey: function() {
        return localStorage.getItem('SPL-Key');
    },
    loadKey: function() {
        app.key = localStorage.getItem('SPL-Key');
        return app.key;
    },
    saveKey: function() {
        if (app.key) {
            localStorage.setItem('SPL-Key', app.key);
        }
    },
    removeKey:function(){
        localStorage.removeItem('SPL-Key');
    },
    init: function(config) {
        app.config = config;
        var theme = '/theme/' + (localStorage.getItem('Theme')||'default') + '/style.css';
        var resources = [
            '/theme/' + (localStorage.getItem('Theme')||'default') + '/style.css',
            {
                url:'/locale/default/templates.html',
                got:function(x){
                    document.getElementById('tpl-container-default').innerHTML=x;
                }
            }
        ];
        var lang = localStorage.getItem('Language');
        if (!lang || lang == 'default')
            lang = navigator.language;
        if (locale.isAvailable(lang)) {
            moment.locale(lang);
            resources.push('/locale/'+lang+'/strings.js');
            resources.push({
                url: '/locale/'+lang+'/templates.html',
                got: function(x){
                    document.getElementById('tpl-container-locale').innerHTML=x;
                }
            });
        }
        
        console.log('load1:',config.loadDuration);
        var now = performance.now();
        dynload(resources,function(){
            console.log('load2:',performance.now()-now);
            app.didLoadResources();            
        });
    },
    didLoadResources: function(){
        app.initWorkspace();    
        var params = getHashParameters();
        var space = params.space || 'default';
        var k = app.key || app.loadKey();
        if (k) {
            httpGetSEXP('/api/spaces/requestAccess', {
                key: k,
                space: space
            }, function(x) {
                app.space = space;
                console.log("did requestAccess:",x);
                if (!x.accessToken) { // The space is not exist
                    app.echo('Can not access');
                } else {
                    document.cookie = 'access-token='+x.accessToken;
                    app.echo('Access OK');
                    app.initMux();
                }
            }, function(err) {
                app.err('request access failed');
                app.removeKey();
                window.location.hash='';
                window.location.reload();
            });
        } else {
            // Should ask for log on
            httpGetSEXP('/api/spaces/check', {}, function(x) {
                if (x.present) {
                    // Prompt for passphrase
                    app.workspace.openViewer({
                        type: 'space-unlock',
                        space: space
                    });
                } else {
                    // Show welcome
                    app.workspace.openViewer({
                        type: 'welcome'
                    });
                }
            }, function(e) {
                app.err(e.error);
            });
        }
        if (app.config.didInit) 
            app.config.didInit();
    },

    initWorkspace: function() {
        var mainDiv = document.getElementById("main");
        var mainOverlay = document.getElementById("mainOverlay");
        var navbarDiv = document.getElementById("navbar");
        var navbarMain = document.getElementById("navbar-main");
        var echoDiv = document.getElementById("echo-area");

        function echo(message) {
            console.log(message);
            echoDiv.textContent = message;
        }

        var mainSpace = new Space({
            subcells: []
        }, null);
        mainSpace.mount(mainDiv);
        app.workspace = mainSpace;
        
        function toggleSwitch(){
            mainSpace.showSwitcher();
        }

        navbarDiv.find('#switch').onclick = function() {
            mainSpace.showSwitcher();
        };
        
        navbarDiv.find('#help').onclick = function() {
            if (!mainSpace.testTopViewer('help')) {
                mainSpace.openViewer({
                    type: 'help',
                    path: 'index'
                }, 'top');
            }
        };
        navbarDiv.find('#search').onclick = function() {
            if (!mainSpace.testTopViewer('note-search')) {
                mainSpace.openViewer({
                    type: 'note-search'
                }, 'top');
            }
        };
        echoDiv.find('#echo-message').onclick = function() {
            if (!mainSpace.testTopViewer('logs')) {
                echoDiv.find('#echo-message').empty();
                mainSpace.openViewer({
                    type: 'logs'
                }, 'top');
            }
        };
        window.onresize = function(event) {
            mainSpace.root.onResize();
        };
    },

    // Open a websocket to app server
    // Make sure the access-token is valid
    // by calling requestAccess
    initMux: function() {
        var mux = new MUX(websocketURLFromPath('/ws/mux'));
        app.mux = mux;
        mux.on('ready', {}, function() {
            app.echo('Space OK');

            var mainSpace = app.workspace;
            mainSpace.mux = mux;
            ////////////////////////////////////////
            // Build Up UI Components

            function updateSpaceProfile() {
                if (mux.currentSpace.photo) {
                    document.getElementById('space-logo').setAttribute('src', mux.currentSpace.photo);
                }
                document.getElementById('space-title').textContent = mux.currentSpace.uuid.getShortId();
            }

            mux.on('did-update-profile', app, function(uuid) {
                if (uuid == mux.currentSpace.uuid) {
                    updateSpaceProfile();
                }
            });

            mux.on('did-post', app, function(unsent) {
                var echoDiv = document.getElementById("echo-area");
                if (unsent) {
                    echoDiv.find('#unsent-indicator').classList.remove('collapse');
                } else {
                    echoDiv.find('#unsent-indicator').classList.add('collapse');
                }
            });

            mux.on('on-sync-progress', app, function(info) {
                var echoDiv = document.getElementById("echo-area");
                if (info.working) {
                    echoDiv.find('#sync-indicator').classList.remove('collapse');
                    echoDiv.find('#sync-indicator').classList.add('fa-spin');
                } else {
                    echoDiv.find('#sync-indicator').classList.add('collapse');
                    echoDiv.find('#sync-indicator').classList.remove('fa-spin');
                }
            });

            mux.on('console', app, function(type, msg) {
                app.addLog(type, msg);
            });

            updateSpaceProfile();
            
            document.getElementById('space-logo').onclick = function(e) {
                var top = mainSpace.getTopViewer();
                if (top && top.data.type == 'launcher') {
                    // do nothing
                } else {
                    mainSpace.openViewer({
                        type: 'launcher'
                    }, 'top');
                }
                // if (mainSpace.backViewers.length == 0) {
                //     mainSpace.openViewer({
                //         type: 'launcher'
                //     }, 'top');
                // } else {
                //     mainSpace.showSwitcher();
                // }

                //  mainSpace.openViewer({
                //      type: 'user',
                //      uuid: mux.currentSpace.uuid
                //  }, 'top-left');
            };
            mux.on('mux-state', {}, function(x, msg) {
                app.echo(msg);
            });

            var params = getHashParameters();
            if (params.v) {
                mainSpace.openViewer({
                    type: params.v,
                });
            } else {
                mainSpace.openViewer({
                    type: 'user',
                    uuid: mux.currentUser.uuid
                });
            }

            if (localStorage.getItem('deviceToken')) {
                mux.request('space-do', [
                    'set-device-info',
                    localStorage.getItem('deviceToken'),
                    localStorage.getItem('deviceType')
                ], function(x) {
                });
            }
        });
    },
    setDeviceInfo: function(token, type) {
        localStorage.setItem('deviceToken', token);
        localStorage.setItem('deviceType', type);
        mux.request('space-do', [
            'set-device-info',
            token,
            type
        ], function(x) {
        });
    },
    addNewNote: function(x) {
        app.workspace.openViewer({
            type: 'note',
            mode: 'add-root',
            content: x.content
        }, 'top');
    },
    getAccessToken: function() {
        return { token:  getCookie('access-token') };
    }
};


