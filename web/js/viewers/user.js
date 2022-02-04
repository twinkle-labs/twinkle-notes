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

function UserTimelineEntry(v, item)
{
    var self = this;
    self.container = cloneTemplate("tpl-note-item-brief");

    if (item.commentid) {
        self.container.find('.note-label i').className='fa fa-comment';
    } else if (item.parentid) {
        self.container.find('.note-label i').className='fa fa-code-branch';
    } else if (item.threadid) {
        self.container.find('.note-label i').className='fa fa-arrow-up';
    }

    if (item.photo) {
        self.container.find('#photo').setAttribute('src', item.photo);
        self.container.find('#photo').classList.remove('hidden');
    }
    
    self.container.find('#note-id').textContent = item.hash.substring(0,8);
    self.container.find('#last-modified').textContent = moment.unix(item.mtime).fromNow();

    // Build the note content 
    var x = self.container.find('.title');
    x.textContent = item.subject;
    //renderNote(parseNote(item.subject), x, {viewer:v});
    self.container.onclick = function(e) {
	v.space.openViewer({
	    type:'note',
	    noteId: item.hash
	}, v);
	return true;
    };
}

function createMention(viewer, s)
{
    var el = document.createElement('a');
    el.className = "note-mention";
    el.href='#';
    el.textContent = s;
    el.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
	var t = s.substring(1);
	if (t.length < 30) {
	    viewer.space.mux.request('space-do', ['query-user', t], function(r) {
		if (r.length == 1) {
		    viewer.space.openViewer({
			type: 'user',
			uuid: r[0].uuid
		    }, viewer);
		} else if (r.length == 0) {
		    app.err("No such user");
		} else {
		    app.err("Too many users");
		}
	    });
	} else {
            viewer.space.openViewer({
		type: 'user',
		uuid: t
            }, viewer);
	}
    };
    return el;
}


registerViewer('user', {
    name: "User",
    embed: function(note,name,uuid,pk) {
	var v = this;
	var el = document.createElement('a');
        el.innerHTML='<i class="fa fa-id-card"></i> <i id="name"></i> <small id="uuid"></small>';
	el.href='#';
        el.find('#name').textContent = name;
        el.find('#uuid').textContent = uuid.getShortId();
	el.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            v.space.mux.getUserInfo(uuid, function(u) {
                if (!u) {
                    v.space.openViewer({
                        type: 'user-add-contact',
                        uuid: uuid
                    }, v);
                } else {
                    openUser(v, u);
                }
            }, true);
	};
	return el;
    },
    load: function() {
        var v = this;
        var mux = v.space.mux;
        var user = {
            uuid: v.data.uuid,
            name: v.data.uuid
        };

        v.toolbar.addIconButton('map', function(){
            v.space.openViewer({
                type: 'allnotes',
		uuid: v.data.uuid
            }, v);
        });

        v.toolbar.addIconButton('id-card', function(){
            v.space.openViewer({
                type: 'user-profile',
		uuid: v.data.uuid
            }, v);
        });

	const isOwner = (mux.currentSpace.uuid == v.data.uuid);
        const isCurrentUser = (mux.currentUser.uuid == v.data.uuid);

        var vc = cloneTemplate('tpl-user');
	var body = vc.querySelector('.user-timeline');
        var loadOffset = 0;
        const loadLimit = 50;
        
        function updateUserInfo() {
	    v.space.mux.getUserInfo(v.data.uuid, function(u) {
                if (!u)
                    return;
                user = u;
                if (u.photo)
                    vc.querySelector(".user-avatar").setAttribute('src', u.photo);

	        if (u.uuid == mux.currentUser.uuid) {
		    v.setTitle(_t('Me'));
                } else {
                    v.setTitle(u.name);
                }
                vc.querySelector('.user-info-title').textContent = u.name;
                // TODO toggle title into fullname
                if (isOwner) {
                    vc.find('#owner').show();
	        } else {
                    vc.find('#change-role').find('#role'+u.role).showx();
                    vc.find('#change-role').classList.remove('collapse');

                    // If the current user is the space owner, then
                    // we should be able to change the role
		    if (mux.currentUser.uuid == mux.currentSpace.uuid) {
                        vc.find('#change-role').onclick = function() {
			    v.space.openViewer({
			        type: 'user-set-role',
			        uuid: v.data.uuid,
			        role: u.role
			    }, v);
		        };
		    }
                }
                vc.find('.user-info-uuid').textContent = u.uuid.getShortId();
                // TODO toggle into full id
            }, true);
        }

        vc.find(".user-avatar").onclick = function(e) {
            v.space.openViewer({
                type:'image',
                url: e.target.getAttribute('src')
            }, v);
        };

	if (isCurrentUser) {
            vc.find('.user-action').classList.remove('hidden');
            vc.find('#write').classList.remove('hidden');
            vc.find('#write').onclick = function() {
                v.space.openViewer({
                    type: 'note',
                    mode: 'add-root'
                }, v);
            };
        } else if (mux.isOwner()) {
            vc.find('#send').classList.remove('hidden');
            vc.find('#send').onclick = function() {
                openPrivateChat(v, v.data.uuid);
            };
        }

        var selType = vc.find('#listing-type');
        selType.onclick = function(e) {
            var elPrev = selType.find('.active');
            var el = e.target.closest('.tab-item');
            if (el && el != elPrev) {
                el.classList.add('active');
                elPrev.classList.remove('active');
                loadOffset = 0;
                loadNotes();
            }
        };

        vc.find('#more').onclick = function() {
            loadOffset += loadLimit;
            loadNotes();
        };
        
        function getListingType() {
            return selType.find('.active').id;
        }

        function loadNotes() {
            var type = getListingType();
            if (isCurrentUser) {
                if (type == 'recent') {
                    mux.request('space', ["list-recent-notes", 'all', loadOffset, loadLimit], buildNoteList);
                    return;
                }
            }
            mux.request('space', ["list-user-notes", v.data.uuid, type, loadOffset, loadLimit], buildNoteList);
        }

        function buildNoteList(ret) {
            var total = ret[0];
            var r = ret[1];
            if (loadOffset == 0)
                body.empty();
            vc.find('#no-notes').hide();
            if (r.length < loadLimit) {
                vc.find('#more-notes').classList.add('collapse');
            } else {
                vc.find('#more-notes').classList.remove('collapse');
                vc.find('#more-cnt').textContent = total - loadOffset - r.length;
            }
	    if (!r || r.error) {
		body.appendChild(createParagraph(r.error?r.error:'Error'));
	    } else if (r.length > 0) {
		r.forEach(function(item) {
                    if (item.creator) {
                        if (item.creator == mux.currentUser.uuid)
                            item.photo = null;
                        else 
                            item.photo = getDisplayAvatar(item);
                    }
		    var x = new UserTimelineEntry(v, item);
		    body.appendChild(x.container);
		});
            } else {
                vc.find('#no-notes').show();
	    }
        }
        
        mux.on('did-update-profile', v, function(uuid) {
            if (!uuid || uuid == v.data.uuid) {
                updateUserInfo();
            }
        });

        mux.on('did-update-notes', v, function(uuid) {
            if (!uuid || uuid == v.data.uuid) {
                loadOffset = 0;
                loadNotes();
            }
        });
        
        updateUserInfo();
        loadNotes();
        return vc;
    },
    unload: function() {
        var v = this;
        v.space.mux.off('did-update-profile', v);
        v.space.mux.off('did-update-notes', v);
    }
});

registerViewer('u', 'user');
registerViewer('id', 'user');

/*
 * user-add-contact -- Sending friend request
 */
registerViewer('user-add-contact', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-user-add-contact');

        if (!v.space.mux.currentUser.fullname) {
            vc.find('#profile-check').show();
            vc.find('#profile').onclick = function() {
                v.space.openViewer({
                    type: 'user-profile',
                    uuid: v.space.mux.currentUser.uuid
                }, v);
            };
            vc.find('#retry').classList.remove('hidden');
            vc.find('#add-contact').classList.add('collapse');
        }

        if (v.data.uuid) {
            vc.find('#addr').value = v.data.uuid;
        }

        vc.find('#retry').onclick = function(){v.reload();};
        var curr_uuid = v.space.mux.currentUser.uuid;

        v.space.mux.request('space', [
            "get-user-host",
            curr_uuid
        ], function(r) {
            if (r.uuid) {

            } else {
                vc.find('#add-contact').classList.add('collapse');
                vc.find('#host-check').classList.remove('collapse');
                vc.find('#retry').classList.remove('hidden');
            }
        });
        

        function showError(x) {
            vc.find('#error').textContent = x;
        }

        var btnAdd = vc.find('#add');
        btnAdd.onclick = function() {
            var addr = vc.find('#addr').value.trim();
            if (!addr.match(/[A-Z1-9a-z]{32,36}/)) {
                app.err("Invalid address");
                return;
            }
            btnAdd.disabled = true;
            app.echo("Finding host");
            v.space.mux.request('space-do', [
                'find-host',
                addr
            ], function (r) {
                if (r.pk) {
                    app.echo('Sending friend request');
                    v.space.mux.request('space-do', [
                        'host-do',
                        r.uuid,
                        r.ip,
                        r.port,
                        'add-friend-request',
                        addr
                    ], function(result) {
                        btnAdd.disabled = false;                    
                        if (result && !result.error) {
                            v.space.mux.request('space!', [
                                'add-contact',
                                '',
                                addr,
                                r.pk,
                                3
                            ], function(r) {
                                if (r.error) {
                                    showError("Failed to add contact:"+r.error);
                                } else {
                                    var lv = v.leftNeighbor();
                                    if (lv && lv.data.type == 'users')
                                        lv.reload();
                                    v.close();
                                }
                            });
                        } else {
                            showError("Can add friend request: " + result.error);
                        }
                    });
                } else {
                    btnAdd.disabled = false;                    
                    showError("Not hosted" + (r.error?': '+r.error:''));
                }
            });
        };
        return vc;
    }
});

function createLabel(text) {
    var elLabel = document.createElement("label");
    elLabel.textContent = text;
    return elLabel;
}


registerViewer('user-profile', {
    load: function() {
	const v = this;
        const mux = v.space.mux;
        if (!v.data.uuid)
            v.data.uuid = mux.currentUser.uuid;
	const vc = cloneTemplate('tpl-user-profile', {
            name: v.data.uuid.getShortId()
        });
	v.setTitle(vc.getAttribute('v-title') || "Profile: @" + v.data.uuid.substring(0,6));
        
	var elName = vc.querySelector('#user-profile-name');
	var elFullName = vc.querySelector('#user-profile-fullname');
	var elEmail = vc.querySelector('#user-profile-email');
	var elAvatar = vc.querySelector('#user-profile-avatar');
        var currentUser = null;

        vc.find('#user-profile-id').textContent = v.data.uuid;

        mux.getUserInfo(v.data.uuid, function(u) {
            if (!u)
                return;

            currentUser = u;
            if (u.photo)
                elAvatar.setAttribute('src', u.photo);
            if (u.name) {
                elName.value = u.name;
            }
            if (u.fullname) {
                elFullName.value = u.fullname;
            }
            if (u.email) {
                elEmail.value = u.email;
            }
	});
	elAvatar.onclick = function() {
	    var fcViewer = v.space.openViewer({
		type: 'filechooser',
		accept: 'image/*',
		maxImageSize: 128
	    }, v);
	    fcViewer.on('did-upload', function(url) {
		elAvatar.setAttribute('src', url);
	    });
	};

	if (mux.currentUser.uuid == v.data.uuid) {
            var btnSave = v.toolbar.addButton('update', function() {
                var name = elName.value.trim();
                var fullname = elFullName.value.trim();
                var email = elEmail.value.trim();
                var photo = elAvatar.getAttribute('src');
                var updated = false;

                if (!currentUser)
                    return;
	        if (name.length == 0)
		    return;
                
                if (currentUser.name != name)
                    updated = true;
                if ((currentUser.fullname||'') != fullname)
                    updated = true;
                if ((currentUser.email||'') != email)
                    updated = true;
                if (getDisplayAvatar(currentUser) != photo)
                    updated = true;
                if (!updated) {
                    app.echo('Not updated');
                    return;
                }

	        mux.request('space!', [
		    'update-user',
		    v.data.uuid,
                    name, fullname, email, photo
	        ], function(x) {
		    //console.log(x);
		    if (!x||x.error) {
		        app.echo('Fail to save');
		    } else {
		        app.echo('OK Updated');
                        if (v.data.uuid == mux.currentUser.uuid) {
                            mux.currentUser.name = name;
                            mux.currentUser.fullname = fullname;
                            mux.currentUser.email = email;
                            mux.currentUser.photo = photo;
                            currentUser = mux.currentUser;
                        }
                        if (v.data.uuid == mux.currentSpace.uuid) {
                            mux.currentSpace.name = name;
                            mux.currentSpace.fullname = fullname;
                            mux.currentSpace.email = email;
                            mux.currentSpace.photo = photo;
                        }
                        mux.dispatch('did-update-profile', [v.data.uuid]);
		    }
	        });
	    });
        }

        vc.find('#copy-addr').onclick = function() {
            var s = v.data.uuid;
            copyToClipboard(s);
            app.echo('Copied ' + s);
        };
        vc.find('#qr-addr').onclick = function() {
            v.space.openViewer({
                type: 'qrcode',
                text: v.data.uuid
            }, v);
        };
        vc.find('#host').onclick = function() {
            v.space.openViewer({
                type: 'space-host-info',
                uuid: v.data.uuid
            }, v);
        };
        vc.find('#share').onclick = function() {
            var picker = v.space.openViewer({
                type: 'user-picker'
            }, v);
            picker.on('did-pick', function(x) {
                openPrivateChat(v, x, '[id:'+ currentUser.name + ',' + currentUser.uuid + ']');
            });
        };
	return vc;
    }
});

registerViewer('user-set-role', {
    load: function() {
	const v = this;
	const vc = cloneTemplate("tpl-user-set-role", {
            uuid: v.data.uuid.getShortId()
        });

        const roleList = vc.find('#role-list');
	var oldRole = v.data.role || 0;
        var role = oldRole;
        var mux = v.space.mux;

        if (role != 0 && role != 1 && role != 2)
            app.err("Bad role -- " + role);

        function updateRoleList() {
            roleList.querySelectorAll('.fa-check').forEach(function(x){
                x.classList.remove('fa-check');
            });
            vc.find('#role'+ role + ' .fa').classList.add('fa-check');
            if (oldRole == 2 && role == oldRole) {
                vc.find('#invite').classList.remove('hidden');
            } else {
                vc.find('#invite').classList.add('hidden');
            }
        }

        function updateMemberProfile() {
            mux.getUserInfo(v.data.uuid, function(u) {
                mux.request('space!', [
                    'update-user',
                    v.data.uuid,
                    u.name,
                    u.fullname,
                    u.email,
                    u.photo
                ], function(x) {
                });
            });
        }

        vc.find('#invite').onclick = function() {
            mux.request('space-do', [
                'generate-invitation',
                v.data.uuid
            ], function(x) {
                var s = '[space-join:'+mux.currentUser.uuid+","+x.xstr+","+x.ts+']';
                openPrivateChat(v, v.data.uuid, s);
                return;
                mux.request('space', [
                    'find-latest-chat',
                    v.data.uuid
                ], function(item) {
                    if (item.hash) {
                        v.space.openViewer({
                            type: 'chat',
                            hash: item.hash,
                            title: item.title,
                            rcpt: item.rcpt,
                            lastRead: item.lastread,
                            message: s
                        }, v);
                    } else {
                        v.space.openViewer({
                            type: 'chat',
                            rcpt: v.data.uuid,
                            message: s
                        }, v);
                    }
                });
            });
        };

        roleList.onclick = function(e) {
            var el = e.target.closest('.list-item');
            role = parseInt(el.id.substring(4));
            updateRoleList();
            btnSave.disabled = (role == oldRole);
                
        };
        
	var btnSave = v.toolbar.addButton(_t('update'), function() {
	    v.space.mux.request('space!', [
		'set-user-role',
		v.data.uuid,
                role
	    ], function(x) {
                if (x && !x.error) {
		    btnSave.disabled = true;
                    oldRole = role;
                    v.space.mux.dispatch('did-update-profile');
                    updateRoleList();

                    if (role == 2) {
                        updateMemberProfile();
                    }
                } else {
                    app.err(x.error);
                }
	    });
	});

        btnSave.disabled = true;
        updateRoleList();
	return vc;
    }
});

// TODO accept role filter
registerViewer('user-picker', {
    load: function() {
	const v = this;
	const vc = cloneTemplate('tpl-users');
        const userList = vc.find('#users');
        const mux = v.space.mux;

	v.setTitle(_t("Pick a user"));

        userList.onclick = function(e) {
            var el = e.target.closest('.list-item');
	    v.dispatch('did-pick', el.item.uuid, el.item);
	    v.close();            
        };

        loadUserList(v.space.mux, userList);
        
	return vc;
    }
});


function loadUserList(mux, elList) {
    mux.request('space', ['list-users'], function(users) {
        elList.empty();
        users.map(function(x) {
            x.isOwner = mux.currentSpace.uuid == x.uuid;
            if (x.isOwner)
                x.role = 100;
            if (!x.name) x.name = '';
            return x;
        }).sort(function(a,b) {
            if (b.role == a.role)
                return a.name.localeCompare(b.name);
            else
                return b.role - a.role;
        }).forEach(function(x){
            if (x.uuid == mux.currentUser.uuid)
                return;

            var el = cloneTemplate('tpl-user-list-item');
            var icon  = null;
            switch (x.role) {
            case 100:
                el.find('#status').textContent = _t('owner');
                break;
            case 2:
                el.find('#status').textContent = _t('member');
                break;
            case 1:
                break;
            case 3:
                el.find('#status').textContent = _t('waiting');
                break;
            case 4:
                el.find('#status').textContent = _t('request');
                break;
            default:
                el.find('#status').textContent = _t('blocked');
                break;
            }

            el.find("img.avatar").setAttribute('src', getDisplayAvatar(x));
            el.find("#title").textContent =  x.name || _t("Unknown");
            el.find("#uuid").textContent = '@' + x.uuid.substring(0,6);
            el.item = x;
            elList.appendChild(el);
        });
    });
}

function openUser(v, u) {
    if (u.role == 3) { // Waiting for acceptance
        v.space.openViewer({
            type: 'user-friend-check',
            uuid: u.uuid
        }, v);
    } else if (u.role == 4) { // Incoming friend request
        v.space.openViewer({
            type: 'user-friend-request',
            uuid: u.uuid,
        }, v);
    } else if (u.name) {
        v.space.openViewer({
            type: 'user',
            uuid: u.uuid,
            name: u.name
        }, v);
    } else {
        v.space.openViewer({
            type: 'help',
            path: 'unknown-user'
        }, v);
    }
}

registerViewer('users', {
    load: function() {
	var v = this;
	var mux = v.space.mux;
        const vc = cloneTemplate('tpl-users');

        const userList = vc.find('#users');

	if (mux.currentUser.uuid == mux.currentSpace.uuid) {
	    v.toolbar.addIconButton("user-plus", function() {
		v.space.openViewer({
		    type: 'user-add-contact'
		}, v);
	    });
	}

        userList.onclick = function(e) {
            var el = e.target.closest('.list-item');
            openUser(v, el.item);
        };

        mux.on('did-update-profile', v, function(uuid) {
            loadUserList(mux, userList);
        });

        loadUserList(mux, userList);
        return vc;
    },
    unload: function() {
        var v = this;
        v.space.mux.off('did-update-profile', v);
    }
});

registerViewer('user-friend-request', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-user-friend-request');

        vc.find('#uuid').textContent = v.data.uuid.getShortId();
        
        vc.find('#accept').onclick = function() {
	    v.space.mux.request('space!', [
		'set-friend',
		v.data.uuid
	    ], function(x) {
                v.leftNeighbor().reload();
                v.close();
	    });
        };

        vc.find('#reject').onclick = function() {
	    v.space.mux.request('space!', [
		'set-user-role',
		v.data.uuid,
                0
	    ], function(x) {
                v.leftNeighbor().reload();
                v.close();
	    });
        };
        
        return vc;
    }
});

/* Check if the current user is a friend in the target space of `uuid` */
registerViewer('user-friend-check', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-user-friend-check', {
            uuid: v.data.uuid.getShortId()
        });

        vc.find("#check").onclick = function() {
            v.reload();
        };
        vc.find("#confirm").onclick = function() {
	    v.space.mux.request('space!', [
		'set-friend',
                v.data.uuid
	    ], function(x) {
                if (x && !x.error) {
                    v.space.mux.dispatch('did-update-profile');
                    v.close();
                } else {
                    showError('#something-wrong', x.error);
                }
            });
        };

        function check() {
            var addr = v.data.uuid;
            v.space.mux.request('space-do', [
                'find-host',
                addr
            ], function (r) {
                if (r.pk) {
                    app.echo('Checking friend status');
                    v.space.mux.request('space-do', [
                        'host-do',
                        r.uuid,
                        r.ip,
                        r.port,
                        'get-current-role',
                        addr
                    ], function(result) {
                        vc.find('#loading').classList.add('collapse');
                        if (!result.error) {
                            app.echo('Friend status: ' + result);
                            if (result == 1||result==2||result==3) {
                                vc.find('#loading').classList.add('collapse');
                                vc.find('#status').classList.remove('collapse');
                            } else if (result == 4) {
                                // Still waiting for acceptance
                                showError('#waiting');
                            } else {
                                showError('#not-friend');
                            }
                        } else {
                            showError('#something-wrong', result.error);
                        }
                    });
                } else {
                    showError('#host-not-found', r.error);
                }
            });
        }

        function showError(x, msg) {
            if (msg) {
                app.err(msg);
            }
            vc.find('#loading').classList.add('collapse');            
            vc.find('#error').classList.remove('collapse');
            vc.find(x).classList.remove('collapse');
        }
        
        check();
        return vc;
    }
});


registerViewer('allnotes', {
    name: "All Notes",
    load: function() {
	const v = this;
        const vc = cloneTemplate('tpl-all-notes');
	var loadOffset = 0;
	var loadLimit = 200;
	var body = vc.querySelector('.notes');
        var mux = v.space.mux;
	v.setTitle(_t('All Notes'));
	v.container.classList.add('fat');
        function loadNotes() {
            mux.request('space', ["list-recent-notes", 'created', loadOffset, loadLimit], buildNoteList);
        }

	function buildNoteList(ret) {
            var total = ret[0];
            var r = ret[1];
            if (loadOffset == 0)
                body.empty();
            if (r.length < loadLimit) {

            } else {
		loadOffset += loadLimit;
		loadNotes();
            }
	    if (!r || r.error) {
		body.appendChild(createParagraph(r.error?r.error:'Error'));
	    } else if (r.length > 0) {
		r.forEach(function(item) {
		    var el = document.createElement('a');
		    el.classList.add('text-ellipsis');
		    if (item.commentid) {
			el.innerHTML = '<i class="text-muted fa fa-comment"></i>';
		    } else if (item.parentid) {
			el.innerHTML = '<i class="text-muted fa fa-code-branch"></i>';
		    } else if (item.threadid) {
			el.innerHTML = '<i class="text-muted fa fa-arrow-up"></i>';
		    }
		    var node = document.createTextNode(item.subject);
		    el.appendChild(node);
		    
		    el.onclick = function(e) {
			v.space.openViewer({
			    type: 'note',
			    noteId: item.hash
			}, v);
		    };
		    body.appendChild(el);
		});
	    }
	}
	loadNotes();
	return vc;
    }

});
