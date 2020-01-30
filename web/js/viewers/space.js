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

function FormView(viewer, spec, attrs) {
    var self = this;
    self.container = document.createElement('div');
    self.container.className = 'form';
    spec.forEach(function(item) {
	var el = document.createElement('div');
	el.className = 'form-item';
	var label = document.createElement('label');
	label.textContent = item.title;
	el.appendChild(label);
	var valueElement = document.createElement('div');
	if (!item.name || !attrs[item.name])
	    valueElement.textContent = "N/A";
	else
	    valueElement.textContent = attrs[item.name];
	el.appendChild(valueElement);
	self.container.appendChild(el);
    });
}


registerViewer('space', {
    name: 'Space',
    embed: function(note,id,name,secret) {
	var v = this;
	var el = document.createElement('a');
	el.href='#';
	el.textContent = '⍟'+ name + "(" + id + ")";
	el.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
	    if (id == 'default') {
		window.location.hash = "space=" + id;
		window.location.reload();
	    } else {
		v.space.mux.request('space-touch', [name,id,secret?secret:false], function(r) {
		    if (!r.error) {
			window.location.hash = "space=" + id;
			window.location.reload();
		    }
		});
	    }
	};
	return el;
    }

});


// If space doesnot exist, offer to create one
// If identity not provided, offer to use current user identity or simply
// use a different one.
registerViewer('space-create', {
    name: 'Create Space',
    load: function() {
        var v = this;
        var vc = cloneTemplate('tpl-space-create');
        
	var inputName = vc.find('#space-name');
	if (!app.key) {
            vc.find('#pass').show();
	}

        vc.find('#create').onclick = function() {
	    if (inputName.value.length < 1) {
		app.err('Empty name');
		return;
	    }
	    if (!app.key) {
	        var inputPass1 = vc.find('#pass1');
	        var inputPass2 = vc.find('#pass2');
                
		if (inputPass1.value != inputPass2.value) {
		    app.err('Passphrase different');
		    return;
		} else if (inputPass1.value.length < 6) {
		    app.err('Passphrase too short (< 6)');
		    return;
		}
		httpGetSEXP('/api/spaces/add', {
		    name: inputName.value,
		    passphrase: inputPass1.value
		}, function(x) {
		    window.location.hash = "space=" + x.space;
		    window.location.reload();
		}, function(e) {
		    app.err('failed to add space:' + e.error);
		});
	    } else {
		httpGetSEXP('/api/spaces/add', {
		    name:inputName.value,
		    key: app.key
		}, function(x) {
			if (!x || x.error) {
				app.err('Create space error:'+x.error);
			} else {
				window.location.hash = "space=" + x.space;
				window.location.reload();
			}
		}, function(e) {
		    app.err('failed to add space:' + e.error);
		});
	    }
	};

	return vc;
    }
});

registerViewer('space-admin', {
    name: "Space Admin",
    load: function() {
        var v = this;
        var mux = v.space.mux;
	var vc = cloneTemplate('tpl-space-admin');

        if (v.data.command) {
            vc.find('#command').value = v.data.command;
        }
        vc.find('#run').onclick = function() {
            var t = vc.find('#command').value.trim();
            if (t) {
                mux.sendRequestString('space-do ' + t, function(x) {
                    app.echo(t + " => " + JSON.stringify(x));
                });
            }
        };
        return vc;
    }

});

registerViewer('space-sync', {
    name: "Space Sync",
    load: function() {
        var v = this;
        var mux = v.space.mux;
	var spaceId = mux.currentSpace.uuid;
	var isOwner = spaceId == mux.currentUser.uuid;
        var vc = cloneTemplate("tpl-sync-info");

        function updateSyncInfo() {
            mux.request('space-do', ["get-sync-status"], function(r) {
                showSyncInfo(r);
            });
        }

	function showSyncInfo(r) {
            vc.find('#sync-info-container').hideAll();
            if (r.working || r.starting) {
                vc.find('#sync-info-working').show();
                vc.find('.fa-sync').classList.add('fa-spin');
                vc.find('#pulled').textContent = r.pulled;
                vc.find('#remain').textContent = r.maxPos - r.pos;
                vc.find('#pushed').textContent = r.pushed;
            } else if (r.lastSynced) {
                btnSync.disabled = false;                
                vc.find('.fa-sync').classList.remove('fa-spin');
                vc.find('#sync-info-idle').show();
                vc.find('#num-blobs').textContent = r.maxPos;
                vc.find('#last-synced').textContent =  moment.unix(r.lastSynced).fromNow();
            } else {
                if (r.error == 'Connecting') {
                    vc.find('.fa-sync').classList.add('fa-spin');
                } else {
                    vc.find('.fa-sync').classList.remove('fa-spin');
                    btnSync.disabled = false;
                }
                vc.find('#sync-info-error').show();
                vc.find('#sync-info-error').textContent = r.syncError || r.error;
            }
	}

        function startSync() {
            if (btnSync.disabled)
                return;
            btnSync.disabled = true;
            vc.find('#sync-info-container').hideAll();
            app.echo('Sync starting... ');
	    mux.request('space-do', ["start-sync",true], function(r) {
                if (r.pid) {
                    app.echo('Sync started: child #' + r.pid);
                    updateSyncInfo();
                } else {
                    vc.find('#sync-info-action').show();
                    vc.find('.fa-sync').classList.remove('fa-spin');
                    app.err('Sync failed: ' + r.error);

                    btnSync.disabled = false;
                }
	    });
        }

        function stopSync() {
            showSyncInfo({error: 'User stopping'});
            mux.request('space-do', ["stop-sync"], function(r) {
                btnSync.disabled = false;
                vc.find('.fa-sync').classList.remove('fa-spin');
                showSyncInfo({error: 'User stopped'});
            });
        }

	var btnSync = v.toolbar.addButton(_t("Start"), function() {
            startSync();
	});
        
	var btnStop = v.toolbar.addButton(_t("Stop"), function() {
            stopSync();
	});

        vc.find('.sync-indicator-large i.fa-sync').onclick = function() {
            startSync();
        }

        vc.find('#view-host').onclick = function(){
	    v.space.openViewer({
		type: 'space-host-info',
                uuid: spaceId
	    }, v);
        };

	var btnViewHost = v.toolbar.addButton(_t("View host"), function() {
	    v.space.openViewer({
		type: 'space-host-info',
                uuid: spaceId
	    }, v);
	});
        
        vc.find('#get-hosted').onclick = function(){
	    v.space.openViewer({
	        type: 'space-host'
	    }, v);
        };
        
        v.space.mux.on('on-sync-progress', v, function(info) {
            showSyncInfo(info);
        });

        startSync();        
        return vc;
    },
    unload: function() {
        var v = this;
        v.space.mux.off('on-sync-progress', v);
    }

});

registerViewer('space-post', {
    load: function() {
        var v = this;
        var vc = cloneTemplate('tpl-space-post');

        function updatePostStatus() {
            v.space.mux.request('space-do',['get-post-status'], function(x) {
                if (x && x.length == 3) {
                    var a = vc.querySelector('#unsent');
                    a.empty();
                    var pid = x[0];
                    var currentRcpt = x[1];
                    if (x[2].length > 0) {
                        vc.find("#empty").classList.add('collapse');
                    } else {
                        vc.find("#empty").classList.remove('collapse');
                    }
                    x[2].forEach(function(item){
                        var el = cloneTemplate("tpl-space-post-item", {
                            shortId : item.uuid.getShortId(),
                            name: item.name || "Unknown",
                            cnt: item.cnt
                        });
                        if (pid && item.uuid == currentRcpt) {
                            el.find("#posting-indicator").classList.remove("collapse");
                        }
                        el.item = item;
                        a.appendChild(el);
                    });
                    if (pid) {
                        setTimeout(updatePostStatus, 1000);
                    }
                }
            });
        }

        vc.find('#unsent').onclick = function(e) {
            var el = e.target.closest('.list-item');
            var item = el.item;
            var dlg = cloneTemplate('tpl-space-post-action-sheet');
            dlg.find('#rcpt').textContent = item.uuid.getShortId();

            dlg.find('#resend').onclick = function() {
                v.dismissModal();
                v.space.mux.request('space-do',['start-posting', item.uuid], function(x) {
                    updatePostStatus();
                });

            };
            dlg.find('#abort').onclick = function() {
                v.dismissModal();
                v.space.mux.request('space',['remove-unsent', item.uuid], function(x) {
                    updatePostStatus();
                });
            };
            dlg.find('#cancel').onclick = function() {
                v.dismissModal();
            };
            v.showModal(dlg);
        };

        v.toolbar.addButton(_t('Resend All'), function(){
            v.space.mux.request('space-do',['start-posting'], function(x) {
                updatePostStatus();
            });
        });

        updatePostStatus();        
        return vc;
    }
});

registerViewer('space-host-info', {
    load: function() {
        var v = this;
        var vc = cloneTemplate('tpl-host-info');
        var mux = v.space.mux;
        if (!v.data.uuid)
            v.data.uuid = mux.currentSpace.uuid;

        v.setTitle('Host Info' + ': ' + v.data.uuid.substring(0,6));
        vc.querySelector('#space-id').value = v.data.uuid;

        function showHostInfo(info) {
            vc.querySelector('#host-type').value = info.type||"hub";
            vc.querySelector('#host-ip').value = info.ip;
            vc.querySelector('#host-port').value = info.port;
            vc.querySelector('#host-id').value = info.uuid;
            vc.querySelector('#host-contract').value = info.contract||info.contractno||"";
        }
        
        v.space.mux.request('space', ["get-user-host", v.data.uuid], function(r) {
            if (r.uuid) {
		showHostInfo(r);
            } else {
                if (v.space.mux.currentUser.uuid == v.space.mux.currentSpace.uuid)
                    btnHost.classList.remove('hidden');
            }
        });

	function lookupHost() {
	    app.echo("Looking up host ...");
	    mux.request('space-do', ["find-host", v.data.uuid], function(r) {
		if (r.uuid) {
                    //btnHost.disabled = true;
		    showHostInfo(r);
                    app.echo("Done");
		} else {
                    //btnHost.disabled = false;
                    app.err("Looup failed");
		}
	    });
	}
        
        v.toolbar.addButton("lookup", function(){
	    lookupHost();            
        });
        
        
        var btnHost = v.toolbar.addButton("Get hosted", function(){
	    v.space.openViewer({
	        type: 'space-host'
	    }, v);            
        });
        //btnHost.classList.add('hidden');

        return vc;
    }
});

//--------------------------------------------------------------

registerViewer('space-host', {
    name: "Space Admin - Host your space",
    load: function() {
	
        var v = this;
        var mux = v.space.mux;
	var spaceId = mux.currentSpace.uuid;
        var vc = cloneTemplate('tpl-space-get-hosted');

        function checkStatus() {
            v.space.mux.request('space-do', [
                'registry-do', 'get-space-status'
            ], function(r) {
                if (!r || r.error) {
                    app.err(r.error);
                    return;
                }
                var x = r[0];
                var y = r[1];

                if (x.host) {
                    vc.find('#host-ip').textContent = r.ip;
                    vc.find('#host-info').show();
                } else if (!x.credit || x.credit <= x.usage) {
                    // Insufficient credit
                    vc.find('#token-form').show();
                } else {
                    assignHost();
                }
            });
        }

        function assignHost() {
            v.space.mux.request('space-do', [
                'registry-do',
                'assign-host',
                mux.currentSpace.uuid
            ], function(r) {
                if (!r || r.error || !r.uuid) {
                    app.err(r.error);
                    return;
                }
                vc.find('#host-ip').textContent = r.ip;
                vc.find('#host-info').show();
                vc.find('#token-form').hide();
                
                v.space.mux.request('space-do', [
                    'set-host-info',
                    mux.currentSpace.uuid,
                    'hub',
                    r.uuid,
                    r.ip,
                    r.port,
                    r.contractno
                ], function(r) {
                    if (r.error)
                        app.err(r.error);
                });
            });
        }
        
        vc.find('#submit').onclick = function() {
	    var tokenInput = vc.querySelector('#token');
            if (!tokenInput.value) {
                return;
            }
	    mux.request('space-do', [
                "registry-do",
                "redeem-token",
                tokenInput.value
            ], function(r) {
                if (r.credit) {
                    if (r.credit > r.usage) {
                        assignHost();
                    }
                } else {
                    app.err('Can not redeem token: ' + r.error);
                }
	    });
	};

        if (mux.currentUser.uuid == mux.currentSpace.uuid)
        {
            checkStatus();
        }

	return vc;
    }
});

registerViewer('space-share', {
    name: "Share space link",
    load: function() {
	var v = this;
        var mux = v.space.mux;
	var spaceId = mux.currentSpace.uuid;
	var isOwner = spaceId == mux.currentUser.uuid;
	var cel = document.createElement("div");
	var link;
	cel.appendChild(createParagraph("Please copy the following link to your friend"));
	mux.request('space-do', ['get-secret'], function(r) {
	    if (r) {
		link = "[space:"+spaceId+","+mux.currentSpace.name+","+r+"]";
		cel.appendChild(createParagraph(link));
	    } else {
		app.err("error");
	    }
	});
	cel.appendChild(createButton("Copy to clipboard", function() {
	    copyToClipboard(link);
	}));
	return cel;
    }
});


registerViewer('space-unlock', {
    name: "Unlock Space",
    load: function() {
	var v = this;
	var vc = cloneTemplate('tpl-space-unlock');

	var inputPass = vc.find('#pass');
	var toggle = vc.find('#toggle');

        vc.find('#unlock').onclick = function() {
            var pass = inputPass.value.trim();
	    if (pass.length < 1) {
		return;
	    }
	    httpGetSEXP('/api/spaces/requestAccess', {
		passphrase: pass,
		space: v.data.space
	    }, function(x) {
		console.log(x);
		if (x.space && x.key && x.accessToken) {
		    app.key = x.key;
		    if (toggle.checked) {
			// Can be used for future sessions
			// even after app is restarted
			app.saveKey();
		    }
		    v.close();
		    document.cookie = 'access-token='+x.accessToken;
		    app.echo('Unlocked OK');
		    app.initMux();
		} else if (!x.key) {
		    app.err('Error passphrase, please retry');
		} else if (!x.space) {
		    app.err('No such space');
		} else {
                    app.err('Unknown error');
		}
	    }, function(x) {
		app.err("Unlock failed: " + x.error);
	    });
	};
	return vc;
    }
});

registerViewer('space-exit', {
    load:function(){
	var v = this;
        var vc = cloneTemplate("tpl-space-exit");

	vc.find('#exit-lock').onclick = function(){
	    window.location.hash='';
            if (app.getSavedKey()) {
	        app.removeKey();                           
                v.showPrompt({
                    title: "Locking",
                    message: 'Enter your passphrase',
                    password: true
                }, function(pass) {
                    v.dismissModal();
                    httpGetSEXP('/api/spaces/update-salt', {
                        passphrase: pass
                    }, function(x) {
                        console.log("update salt:", x.success);
	                window.location.reload();
                    });
                });
            } else {
	        window.location.reload();
            }
	};

	vc.find('#go-default').onclick = function(){
	    window.location.hash = '';
	    window.location.reload();
	};

	vc.find('#cancel').onclick = function(){
	    v.close();
	};

	return vc;
    }
});

registerViewer('space-import', {
    embed: function(note,b64,salt,ts) {
        var v = this;
        var el = document.createElement('a');
        el.href='#';
        el.textContent = 'Import space';
        el.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            v.space.openViewer({
                type: 'space-import',
                importstr: '[space-import:'+b64+","+salt+","+ts+"]"
            }, v);
        };
        return el;
    },
    load: function() {
        var v = this;
        var vc = cloneTemplate('tpl-space-import');

        var inputPass = vc.querySelector('#pass');
        var ta = vc.querySelector('#import-str');
        if (v.data.importstr) {
            ta.value = v.data.importstr;
        }
        vc.querySelector('#import').onclick = function() {
            if (!inputPass.value.trim()) {
		app.err("No passphrase");                
                return;
            }
            if (!ta.value.trim()) {
		app.err("No import string");                
                return;
            }
            var s = ta.value;
            var prefix = '[space-import:';
            if (s.indexOf(prefix) != 0) {
		app.err("Invalid import string");
                return;                
            }
            var parts = s.substring(prefix.length,s.length-1).split(',');
            if (parts.length < 3) {
		app.err("Invalid import string");
                return;                
            }

	    httpGetSEXP('/api/spaces/import', {
		passphrase: inputPass.value.trim(),
                xstr: parts[0],
                salt: parts[1],
                ts: parts[2]
	    }, function(x) {
		console.log(x);
		window.location.hash = "space=" + x.space + '&v=space-sync';
		window.location.reload();                
	    }, function(x) {                
		app.err("Import failed: " + x.error);
	    });
        };
        return vc;
    }
});

registerViewer('space-export', {
    load: function() {
        var v = this;
        var vc = cloneTemplate('tpl-space-export');

        var inputPass = vc.querySelector('#pass');
        var btnCopy = vc.find('#cp');
        vc.querySelector('#gen').onclick = function() {
            var pass = inputPass.value.trim();
            if (pass.length < 6) {
		app.err("Passphrase too short");                
                return;
            }
	    httpGetSEXP('/api/spaces/export', {
		passphrase: pass
	    }, function(x) {
		console.log(x);
                var s = "[space-import:" + x.xstr + "," + x.salt + "," + x.ts + "]";
                vc.querySelector('#export-str').textContent = s;
                vc.find('#qrcode').empty();
                new QRCode(vc.find('#qrcode'), s);
                vc.find('#output').show();
	    }, function(x) {                
		app.err("export failed: " + x.error);
	    });
        };
        btnCopy.onclick = function() {
            copyToClipboard(vc.querySelector('#export-str').textContent);
        };
        return vc;
    }
});

registerViewer('space-join', {
    embed: function(note, spaceid, b64, ts) {
        var v = this;
        var el = document.createElement('a');
        el.href='#';
        el.textContent = 'Join space' + ':' + spaceid.getShortId();
        el.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (v.space.mux.currentUser.uuid != spaceid) {
                v.space.openViewer({
                    type: 'space-join',
                    joinstr: '[space-join:'+spaceid+","+b64+","+ts+"]"
                }, v);
            } else {
                app.echo('You are in the space!');
            }
        };
        return el;
    },
    load: function() {
        var v = this;
        var vc = cloneTemplate('tpl-space-join');
        var mux = v.space.mux;
        var spaceInfo = null;
        
        function initInfo() {
            var s = v.data.joinstr;
            var prefix = '[space-join:';
            if (s.indexOf(prefix) != 0) {
		app.err("Invalid join string");
                return;                
            }
            var parts = s.substring(prefix.length,s.length-1).split(',');
            if (parts.length < 3) {
		app.err("Invalid join string");
                return;                
            }
            v.space.mux.request('space-do', [
                'decode-invitation',
                parts[0],
                parts[1],
                parts[2]
            ], function(x) {
                if (x.error) {
                    app.err(x.error);
                } else {
                    if (x.uuid == mux.currentSpace.uuid) {
                        vc.find('#join-error').show();
                    } else {
                        vc.find('#join').disabled = false;
                    }
                    vc.find('#uuid').textContent = x.uuid;
                    vc.find('#name').textContent = x.name;
                    spaceInfo = x;                    
                }
            });
        };

        vc.find('#join').onclick = function() {
            mux.request('space-do', [
                'get-current-user-vk'
            ], function(vk) {
                if (!vk ||vk.error) {
                    app.err(vk.error);
                    return;
                }
	        httpGetSEXP('/api/spaces/join-space', {
                    key: app.key,
                    spaceId: spaceInfo.uuid,
                    spacePk: spaceInfo.pk,
                    spaceName: spaceInfo.name,
                    userName: mux.currentUser.name,
                    userVk: vk,
                    secret: spaceInfo.secret
	        }, function(x) {
		    console.log(x);
                    if (x.space) {
		        window.location.hash = "space=" + x.space + '&v=space-sync';
		        window.location.reload();                
                    } else {
                        app.err(x.error);
                    }
	        }, function(e) {                
		    app.err("Join Error: " + e.error);
	        });
            });
        };

        initInfo();
        return vc;
    }
});

registerViewer('space-invite', {
    load: function() {
        var v = this;
        var vc = cloneTemplate('tpl-space-invite');

        var mux = v.space.mux;

        function generateInvitation(uuid) {
            mux.request('space-do', [
                'generate-invitation',
                uuid
            ], function(x) {
                if (x.error) {
                    app.err(x.error);
                } else {
                    var s = '[space-join:'+mux.currentUser.uuid+","+x.xstr+","+x.ts+']';
                    vc.find('#invite-str').textContent = s;
                    vc.find('#qrcode').empty();                    
                    new QRCode(vc.find('#qrcode'), s);
                    vc.find('#info').show();
                }
	    }, function(e) {                
	        app.err("failed to invite: " + e.error);
	    });
        }

        vc.find('#pick').onclick = function() {
            var viewer = v.space.openViewer({
                'type': 'user-picker',
                'role': 'member'
            }, v);
            viewer.on('did-pick', function(x) {
                vc.find('#uuid').value = x;
                vc.find('#info').hide();
                generateInvitation(x);
            });
        };

        vc.find('#send').onclick = function() {
            // Send invitation string as a chat message
        };
        
        vc.find('#cp').onclick = function() {
            copyToClipboard(vc.find('#invite-str').textContent);
            app.echo('invitation copied');
        };
        return vc;
    }
});


registerViewer('space-list', {
    load: function() {
        var v = this;

        var vc = cloneTemplate('tpl-space-list');
        var listContainer = vc.find('#space-list');

        function setDefault(el) {
            var a = listContainer.children;
            for (var i = 0; i < a.length; i++) {
                if (a[i].item && a[i].item.isDefault) {
                    a[i].item.isDefault = false;
                    a[i].hide('#default-mark');
                    break;
                }
            }
            el.show('#default-mark');
            el.item.isDefault = true;
        }
        
        function didItemClick(e) {
            var el = e.target.closest('.list-item');
            var item = el.item;
            var dlg = cloneTemplate('tpl-dlg-space-op');

            if (!item.isCurrent) {
                dlg.find('#open').onclick = function() {
                    window.location.hash = "space=" + item.dbname;
		    window.location.reload();   
                };
            } else {
                dlg.hide('#open');
            }

            if (!item.isDefault) {
                dlg.find('#set-default').onclick = function() {
                    httpGetSEXP('/api/spaces/set-default', {
                        dbname: item.dbname,
                        key: app.key
                    }, function(x) {
                        if (x.defaultSpace == item.dbname) {
                            app.echo("OK");
                            setDefault(el);
                            v.dismissModal();
                        } else {
                            app.err("Failed to update");
                        }
                    });
                };
            } else {
                dlg.hide('#set-default');
            }

            if (!el.classList.contains('active')) {
                dlg.find('#delete').onclick = function() {
                    v.dismissModal();
                    v.showPrompt({
                        title: "Deleting " + item.name,
                        message: 'Type DELETE to confirm'
                    }, function(result) {
                        if (result=='DELETE') {
                            app.echo("Removing...");
                            httpGetSEXP('/api/spaces/remove-space', {
                                key: app.key,
                                dbname: item.dbname
                            }, function(x) {
                                if (x.error) {
                                    app.echo("Can not remove space");
                                } else {
                                    app.echo("OK Removed");
                                    v.reload();
                                }
                            });
                        }
                        v.dismissModal();
                    });
                };
            } else {
                dlg.find('#delete').classList.add('hidden');
            }

            dlg.find('#cancel').onclick = function() {
                v.dismissModal();
            };
            v.showModal(dlg);
        };

        httpGetSEXP('/api/spaces/list-spaces', {
            key: app.key
        }, function(x) {
            console.log(x);
            var defaultSpace = x[0];
            var spaces = x[1];

            spaces.sort(function(a,b) {
                return a.name.localeCompare(b.name);
            });

            spaces.forEach(function(item) {
                var el = cloneTemplate('tpl-space-list-item', {
                    name: item.name||_t("Unknown"),
                    uuid: item.uuid.getShortId(),
                    creator: item.creator==item.uuid?_t("owner"):item.creator.getShortId()
                });
                el.item = item;

                if (item.uuid == v.space.mux.currentSpace.uuid &&
                    item.creator == v.space.mux.currentUser.uuid)
                {
                    item.isCurrent = true;
                    el.classList.add('active');
                }

                if (defaultSpace == item.dbname) {
                    el.find('#default-mark').show();
                    item.isDefault = true;
                }

                el.onclick = didItemClick;
                listContainer.appendChild(el);
            });
        }, function (err) {
            app.err(err);
        });

        v.toolbar.addButton(_t("+new"), function(){
            v.space.openViewer({
                type: 'space-create'
            }, v);
        });
        v.toolbar.addButton(_t("+import"), function(){
            v.space.openViewer({
                type: 'space-import'
            }, v);
        });
        
        return vc;
    }
});

registerViewer('space-usage', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-loading');

        v.space.mux.request('space', ['stat'], function(r){
            vc.empty();
            var blobsize = r[1].blobsize;
            var blobcnt = r[1].blobcnt;
            var usercnt = r[2].usercnt;
            vc.appendChild(cloneTemplate('tpl-space-usage',
                                         {
                                             blobsize: humanFileSize(blobsize),
                                             blobcnt: blobcnt,
                                             usercnt: usercnt
                                         }));
        });

        return vc;
    }

});

registerViewer('space-billing', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-space-billing');

        v.toolbar.addButton(_t('+token'), function() {
            v.showPrompt({title:"Redeem token"}, function(token){
                if (token) {
                    v.space.mux.request('space-do', ['registry-do', 'redeem-token', token], function(r) {
                        vc.find('#credits').textContent = r.credit - r.usage;
                    });
                }
            });
        });

        v.space.mux.request('space-do', ['registry-do', 'get-billing-info'], function(r){
            vc.empty();
            var x = r[0];
            var y = r[1];
            vc.appendChild(cloneTemplate('tpl-space-billing-info',{
                spaceid: v.space.mux.currentSpace.uuid.substring(0,6),
                credits: x?(x.credit-x.usage):0
            }));
            if (y.length > 0) {
                var elList = vc.find('#invoices');
                y.forEach(function(invoice){
                    var el = cloneTemplate('tpl-invoice-item', {
                        amount: invoice.amount,
                        host: '@' + invoice.host.substring(0,6),
                        blobsize: humanFileSize(invoice.blobsize),
                        in_total: humanFileSize(invoice.in_total),
                        out_total: humanFileSize(invoice.out_total),
                        from: moment.unix(invoice.start_time).format("ll"),
                        to: moment.unix(invoice.end_time).format("ll"),
                    });
                    if (invoice.pay_time) {
                        el.find('#payed').show();
                        el.find('#payed_at').textContent = moment.unix(invoice.pay_time).fromNow();
                        if (invoice.status != 4)
                            el.find('#notify').classList.remove('hidden');
                        else
                            el.find('.fa-check').show();
                    } else {
                        el.find('#pay').classList.remove('hidden');
                        el.find('#pay').onclick = function() {
                            v.space.mux.request('space-do', [
                                'registry-do',
                                'pay-invoice',
                                invoice.id
                            ], function(r) {
                                if (r && !r.error) {
                                    invoice.invoiceno = r.invoiceno;
                                    vc.find('#credits').textContent = r.credit;
                                    el.find('#pay').classList.add('hidden');
                                    el.find('#notify').classList.remove('hidden');
                                    el.find('#notify').click();
                                } else {
                                    app.err('Pay:'+r.error);
                                }
                            });
                        };
                    }

                    el.find('#notify').onclick = function(e) {
                        e.target.disabled = true;
                        app.echo('notifying host...');
                        v.space.mux.request('space-do', [
                            'host-do',
                            invoice.host,
                            invoice.ip,
                            invoice.port,
                            'apply-invoice',
                            invoice.invoiceno
                        ], function(r) {
                            if (r && !r.error) {
                                v.space.mux.request('space-do', [
                                    'registry-do',
                                    'set-invoice-notified',
                                    invoice.invoiceno
                                ], function(r) {
                                    if (r.error) {
                                        app.err(r.error);
                                    } else {
                                        el.find('#notify').classList.add('hidden');
                                        el.find('.fa-check').show();
                                    }
                                });
                            }
                        });
                    };

                    elList.appendChild(el);
                });
                elList.show();
            } else {
                vc.find('#invoices-none').show();
            }
        });

        return vc;
    }
});

registerViewer('welcome', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-welcome');

        vc.find('#space-create').onclick = function() {
            v.space.openViewer({
                type: 'space-create'
            }, 'top');
        };
        return vc;
    }
});

registerViewer('logs', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-logs');

        var elList = vc.find('.list-plain');

        function loadMessages() {
            elList.empty();
            app.logMessages.forEach(function(x) {
                var el = cloneTemplate('tpl-log-item');
                el.find('#log-time').textContent = moment.unix(x.time).format('hh:mm:ss');
                el.find('#log-message').textContent = x.message;
                if (x.type == 'error')
                    el.classList.add('text-danger');
                elList.appendChild(el);
            });
        }

        v.toolbar.addIconButton('trash-alt', function() {
            app.echo('OK');
            app.logMessages = [];
            loadMessages();
        });

        loadMessages();
        return vc;
    }
});
