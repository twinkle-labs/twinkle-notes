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

// Always resume on last known chat
function openPrivateChat(v, rcpt, message)
{
    v.space.mux.request('space', [
        'find-latest-chat',
        rcpt
    ], function(item) {
        if (item.hash) {
            v.space.openViewer({
                type: 'chat',
                hash: item.hash,
                title: item.title,
                rcpt: item.rcpt,
                lastRead: item.lastread,
                message: message
            }, v);
        } else {
            v.space.openViewer({
                type: 'chat',
                rcpt: rcpt,
                message: message
            }, v);
        }
    });
}

function MessageList(v) {
    const self = this;
    self.view = cloneTemplate("tpl-chat-message-list");
    const lv = self.view.find("#msglist");
    var last_t = 0;
    var first_pos = -1;
    var last_pos = -1;
    
    self.view.find("#earlier").onclick = function() {
        if (self.onloadmore && first_pos >= 0)
            self.onloadmore(first_pos, false);
    };

    self.view.find("#later").onclick = function() {
        if (self.onloadmore && last_pos >= 0)
            self.onloadmore(last_pos, true);
    };

    self.getLastPos = function() { return last_pos; }
    self.getFirstPos = function() { return first_pos; }
    
    function makeTimestamp(t) {
        var ts;
        if ((unixtime()-t) < 3600*24)
            ts = moment.unix(t).format('LT');
        else
            ts = moment.unix(t).format('lll');
        var el = document.createElement('div');
        el.className = "text-secondary text-small text-center";
        el.textContent = ts;
        return el;
    }

    function makeMessageItem(x) {
	var el = cloneTemplate("tpl-chat-message-item", {
            cid: x.uuid
        });
        var avatar = el.find("img.avatar");
        avatar.setAttribute('v-open', 'user:uuid='+x.uuid);
        avatar.setAttribute('src', getDisplayAvatar(x));
        
        var textContainer = el.find(".chat-message-text");
        renderNote(parseNote(x.content), textContainer, {viewer:v});
        textContainer.onclick = function(e) { handleNoteClickEvent(v, e); };

        return el;
    }

    self.addMessages = function(msgs, total, forward) {
        if (forward) {
            msgs.forEach(function(x) {
                if (Math.abs(x.ctime - last_t) > 60) {
                    lv.appendChild(makeTimestamp(x.ctime));
                }
                last_t = x.ctime;
                lv.appendChild(makeMessageItem(x));
                if (first_pos < 0 || first_pos > x.id)
                    first_pos = x.id;
                if (last_pos < 0 || last_pos < x.id)
                    last_pos = x.id;
            });
            if (total == msgs.length) {
                // There is no more
                self.view.find('#footer').classList.add('collapse');
            } else {
                self.view.find('#later-cnt').textContent = total - msgs.length;
                self.view.find('#footer').classList.remove('collapse');
            }
            lv.lastChild.scrollIntoView();
        } else {
            var t = 0;
            var el = lv.firstChild;
            var shouldScrollToEnd = (last_pos < 0);
            msgs.reverse().forEach(function(x) {
                if (Math.abs(x.ctime - t) > 60) {
                    lv.insertBefore(makeTimestamp(x.ctime), el);
                }
                t = x.ctime;
                lv.insertBefore(makeMessageItem(x), el);
                if (first_pos < 0 || first_pos > x.id)
                    first_pos = x.id;
                if (last_pos < 0 || last_pos < x.id)
                    last_pos = x.id;
            });
            
            if (total == msgs.length) {
                // There is no more
                self.view.find('#header').classList.add('collapse');
            } else {
                self.view.find('#earlier-cnt').textContent = total - msgs.length;
                self.view.find('#header').classList.remove('collapse');
            }
            if (shouldScrollToEnd)
                lv.lastChild.scrollIntoView();
        }
    };
}

function ChatInputBar(v, options) {
    const self = this;
    self.view = cloneTemplate('tpl-chat-input-bar');
    
    var textInput = self.view.find('.chat-input-text');
    textInput.setAttribute('contenteditable', true);
    
    var buttonPanel = self.view.find('.chat-input-buttons');
    
    textInput.onpaste = function(e) {
        e.preventDefault();
        e.stopPropagation();
        var plaintext = e.clipboardData.getData('text/plain');
        document.execCommand('inserttext', false, plaintext);
    };

    textInput.oninput = function(e) {
//        console.log("oninput", e);
    };

    self.setText = function(t) {
        textInput.textContent = t;
    };

    function post() {
        var t = textInput.innerText.trim();
        textInput.textContent = '';
        if (t.length == 0)
            return;
        if (self.onpost) {
            self.onpost(t);
        }
    }

    textInput.onkeydown = function(e) {  
        if(e.keyCode == 13)
        {
            if (!e.ctrlKey) {
                return true;
            } else {
                post();
                return false;
            }
        }
    };

    self.view.find('#add-image').onclick = function(e) {
        var v = self.view.findViewer();
        var viewer  = v.space.openViewer({
            type: 'filechooser',
            accept: 'image/*'
        }, v);
        viewer.on('did-upload', function(path, file) {
            textInput.textContent += "[image:"+path+"]";
        });
    };

    self.view.find('#send').onclick = function(e) {
        post();
    }
}

registerViewer('chat', {
    name: "Chat",
    load: function() {
        const N = 20; // limit of messages per load        
	const v = this;
	var mux = v.space.mux;
        var hash = v.data.hash;
        var vc = cloneTemplate('tpl-chat', {uuid: v.data.rcpt.getShortId()});

        var msgList = new MessageList(v);
        var inputBar = new ChatInputBar(v);
	vc.appendChild(msgList.view);
	vc.appendChild(inputBar.view);
        inputBar.onpost = function(t) {
            mux.request('space!', [
                'add-chat',
                v.data.rcpt || "",
                hash || "",
                t
            ], function(r) {
                if (r.error) {
                    app.err(r.error);
                    return;
                }
                if (!hash) hash = r.hash;
                if (msgList.getLastPos() > 0) {
                    loadMessages(msgList.getLastPos(), N, true);
                } else {
                    loadMessages(-1, N, false);
                }
            });
        };

        if (v.data.message) {
            inputBar.setText(v.data.message);
        }
        
        // Required for restore scroll position
	v.scrollableElement = msgList.view;

        var loading = false;


        msgList.onloadmore = function(pos, forward) {
            loadMessages(pos, N, forward);
        };
        
        function loadMessages(pos, limit, forward, shouldNotify) {
            if (loading)
                return;
            loading = true;
            mux.request('space', [
                'list-chat-messages', hash, pos, limit, forward
            ], function(r) {
                loading = false;
                var total = r[0];
                var msgs = r[1];

                msgList.addMessages(msgs, total, forward);

                var playSound = false;
                msgs.forEach(function(x) {
                    if (shouldNotify && x.uuid != mux.currentUser.uuid) {
                        playSound = true;
                    }
                });
                if (playSound) {
                    app.playSound('note2');
                }
            });
        }

        v.space.mux.on('on-new-chat', v, function() {
            if (msgList.getLastPos() > 0) {
                loadMessages(msgList.getLastPos(), N, true, true);
            }
        });

        if (hash)
            loadMessages(-1, N, false);
        
	return vc;
    },
    unload: function() {
        var v = this;
        v.space.mux.off('on-new-chat', v);
    }
    
});

registerViewer('chat-list', {

    load: function() {
        var v = this;
        var mux = v.space.mux;
        var vc = cloneTemplate('tpl-chat-list');
        var listContainer = vc.querySelector("#chat-list");
        
        const isOwner = (mux.currentUser.uuid == mux.currentSpace.uuid);
        function loadChats() {
            mux.request('space', ['list-chats', 0, 100], function(x){
                listContainer.empty();
                x[1].forEach(function(item) {
                    if (!isOwner && item.rcpt)
                        return;
                    
                    var title = item.title || '';
                    var to;
                    if (item.rcpt) {
                        to = '@' + item.rcpt.substring(0,6);
                    } else {
                        to = "@all";
                    }

                    var el = cloneTemplate('tpl-chat-list-item', {
                        to: to,
                        name: item.name,
                        lastmessage: item.content.split('\n')[0],
                        lastactive: moment.unix(item.lastactive).fromNow()
                    });
                    if (item.lastread < item.lastactive) {
                        el.find('.unread-indicator').show();
                    }
                    if (item.photo) {
                        el.find('#photo').setAttribute('src', item.photo);
                    }
                    el.onclick = function() {
                        el.find('.unread-indicator').hide();
                        console.log(item);
                        v.space.mux.request('space!', [
                            'add-chat',
                            item.rcpt || '',
                            item.hash,
                            "/read"
                        ], function(r) {
                        });

                        v.space.openViewer({
                            type: 'chat',
                            hash: item.hash,
                            title: item.title,
                            rcpt: item.rcpt,
                            lastRead: item.lastread
                        }, v);
                    };
                    listContainer.appendChild(el);
                });
            });
        }

        if (v.space.mux.isOwner()) {
            v.toolbar.addIconButton('plus', function(){
                var viewer = v.space.openViewer({
                    type: 'user-picker'
                }, v);
                viewer.on('did-pick', function(uuid) {
                    openPrivateChat(v, uuid);
                });
            });
        }

        loadChats();

        return vc;
    }
});
