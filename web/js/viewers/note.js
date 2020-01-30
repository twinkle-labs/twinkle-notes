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

/*
 * note.js -- A note viewer implementation.
 *
 * A viewer of type 'note' is registered.
 */

function createActionIconButton(name, onclick, text, title)
{
    var btn = createIconButton(name, onclick, text, title);
    btn.classList.add('btn-icon');
    return btn;
}

function handleNoteClickEvent(viewer, e) {
    var el = e.target;
    if (el.nodeName == 'A') {
        var t = el.noteRef || el.textContent;
        viewer.space.openViewer({
            type: 'note',
            noteId: t
        }, viewer);
        return true;
    } else if (el.nodeName == 'IMG') {
        didClickImageInNote(e);
        return true;
    }
    return false;
}

function pasteAsPlainText(e) {
    e.preventDefault();
    e.stopPropagation();
    var plaintext = e.clipboardData.getData('text/plain');
    document.execCommand('inserttext', false, plaintext);
}

function createNoteTag(viewer, text)
{
    var el = document.createElement('a');
    el.className = 'note-tag';
    el.textContent = text;
    el.href='#';
    el.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        viewer.space.openViewer({
	    type: 'note-search',
	    text: text
        }, viewer);
    };
    return el;
}

function toggleFavorite(v, note)
{
    var newfav =  note.isfav ? 0 : 1;
    v.space.mux.request('space!', [
        'set-favorite',
        'note',
        note.hash,
        newfav
    ], function(r) {
        if (r && !r.error) {
            if (newfav)
                app.echo("added to favorite");
            else
                app.echo("unfavorited");
            note.isfav = newfav;
            note.controller.refreshActionBar();
        } else {
            app.err(r.error);
        }
    });
}

// r == note data
function findAutoMentions(r)
{
    var a = r.content.match(/@\w+/g)||[];
    var uuid = app.workspace.mux.currentUser.uuid;
    // No point to mention yourself
    a = a.filter(function(x){
        return x != ('@' + uuid.substring(0, x.length-1));
    });

    if (r.creator && r.creator != uuid) {
        a.push('@'+r.creator.substring(0,6));
    }

    if (a.length > 0) {
        a = Array.from(new Set(a));
        return (a.join(' ') + ' ');
    }
    return '';
}

/***********************************************************************
 *
 * Note - Viewing a single note
 *
 * - viewer: we passed in viewer so that it's convenient to fire events.
 * - item: the actual note data
 *      for a new note, some of the fields can be empty.
 **********************************************************************/

function Note(parentList, item)
{
    var self = this;
    var viewer = parentList.viewer;
    self.viewer = viewer;
    self.item = item;
    self.container = cloneTemplate('tpl-note-item');
    self.container.controller = self;
    item.controller = self;
    item.container = self.container;
    
    var tokens = parseNote(item.content);
    var contentElement = self.container.find('.note-content');
    renderNote(tokens, contentElement, self);
    self.contentElement = contentElement;

    var label = self.container.find('.note-label');
    label.textContent = item.hash ? item.hash.substring(0,8) : _t("New");
    if (item.creator) {
        var el = self.container.find('#avatar');
        el.setAttribute('src', getDisplayAvatar(item));
        el.setAttribute('v-open', 'user:uuid='+item.creator);
    }
    if (item.ctime)
        self.container.find('.note-datetime').textContent = moment.unix(item.ctime).format("lll");
    if (item.lastModified)
        contentElement.classList.add('note-edited');

    self.container.appendChild(parentList.actionBarForNote(item));
    
    self.revert = function() {
        if (item.newContent) {
            item.newContent = null;
            item.lastModified = null;
            var el = contentElement;
            el.classList.remove('note-edited');
    	    el.setAttribute('contenteditable', false);
            el.classList.remove('editing');
            renderNote(parseNote(item.content), contentElement, self);
            viewer.didNoteChange();
            self.refreshActionBar();
        }
    };

    self.getCurrentContent = function() {
        if (self.isEditing()) {
            return extractNoteContent(contentElement);
        } else if (item.newContent) {
            return item.newContent;
        } else {
            return item.content;
        }
    };

    self.setCurrentContent = function(text) {
        var el = contentElement;
        if (self.isEditing()) {
            el.empty();
            var t = document.createElement('span');
            t.textContent = text;
            el.appendChild(t);
        } else {
            el.empty();
            renderNote(parseNote(text), el, self);
            updateEditedStatus(text);
        }
    };

    function updateEditedStatus(s)
    {
        var el = contentElement;
        if (s != item.content) {
            item.newContent = s;
            el.classList.add('note-edited');
            item.lastModified = unixtime();
        } else {
            item.newContent = null;
            el.classList.remove('note-edited');
            item.lastModified = null;
        }
        self.refreshActionBar();
        viewer.didNoteChange();
    }

    function endEdit(e) {
        var s = self.getCurrentContent();

        var el = contentElement;
	    el.setAttribute('contenteditable', false);
//        el.setAttribute('draggable', true);
        el.classList.remove('editing');

        self.setCurrentContent(s);

        self.removeInputBar();
        self.refreshActionBar();
    }

    self.endEdit = endEdit;

    contentElement.onclick = function(e) {
        var el = e.target;
        if (el.nodeName == 'VIDEO')
            return;
        else if (el.nodeName == 'A') {
            var t = el.noteRef;
            if (t) {
                var note = parentList.findNoteById(t);
                if (note) {
                    note.container.scrollIntoView();
                } else {
                    viewer.space.openViewer({
                        type: 'note',
                        noteId: t
                    }, viewer);
                }
            }
            return;
        } else if (el.nodeName == 'INPUT') {
            if (el.type == 'checkbox') {
                if (!item.newContent)
                    item.newContent = item.content;
                item.newContent = item.newContent.splice(el.tokenPosition, 3,
                                                         el.checked?"[x]":"[ ]");
                updateEditedStatus(item.newContent);
            }
            return;
        }
        //self.beginEdit();
    };

    // Paste things as plain text
    // perhaps we should handle image or other sort of things in future
    contentElement.onpaste = pasteAsPlainText;

    self.beginEdit = function() {

        if (self.isEditing()) {
            return;
        }

        var el = contentElement;
    	el.setAttribute('contenteditable', true);
//        el.setAttribute('draggable', false);
        el.classList.add('editing');

        if (item.newContent) {
            self.setCurrentContent(item.newContent);
        } else {
            self.setCurrentContent(item.content);
        }
        
	el.focus();
        self.removeActionBar();
        var inputBar = new NoteInputBar(viewer, self);
        self.container.insertBefore(inputBar.container, el.nextSibling);
    };

    self.refreshActionBar = function() {
        self.removeActionBar();
        self.container.insertBefore(
            parentList.actionBarForNote(item),
            contentElement.nextSibling
        );
    };
}

Note.prototype.getSelectedRange = function() {
    var note = this;
    var range = null;
    var el = null;
    if (window.getSelection) {
        sel = window.getSelection();
        if (sel.getRangeAt && sel.rangeCount) {
            range = sel.getRangeAt(0);
            el = range.startContainer.parentNode;
        }
    } else if (document.selection && document.selection.createRange) {
        range = document.selection.createRange();
        el = range.parentElement();
    }
    if (range) {
        if (note.container == el.closest('.note-item')) {
            return range;
        }
    }
    return null;
};

Note.prototype.insertText = function(text, range) {
    if (range) {
        if (window.getSelection) {
            sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            range.deleteContents();
            range.insertNode( document.createTextNode(text) );
        } else if (document.selection && range.select) {
            range.select();
            range.text = text;
        }
    } else {
        this.appendText(text);
    }
};

Note.prototype.isEditing = function() {
    return this.contentElement.isContentEditable ||
        this.contentElement.classList.contains('editing');
};

Note.prototype.updateView = function(created) {
    if (!this.item.lastModified) {
        this.container.querySelector('.note-content').
            classList.remove('note-edited');
    }
    if (created) {
        this.container.querySelector('.note-label')
            .textContent = this.item.hash.substring(0,8);
    }
    this.refreshActionBar();    
};

Note.prototype.removeInputBar = function() {
    this.container.querySelectorAll(".note-input-bar").forEach(function(el){
        el.parentNode.removeChild(el);
    });
};

Note.prototype.removeActionBar = function() {
    this.container.querySelectorAll(".note-action-bar").forEach(function(el){
        el.parentNode.removeChild(el);
    });
};

Note.prototype.subject = function() {
    return this.item.content.split("\n")[0];
};

Note.prototype.shortHash = function() {
    return this.item.hash.substring(0,8);
};

Note.prototype.appendText = function(text) {
    this.setCurrentContent(this.getCurrentContent()+text);
};

Note.prototype.replaceText = function(oldText, newText) {
    this.setCurrentContent(this.getCurrentContent().replace(oldText, newText));
};

Note.prototype.toggleBranch = function(e) {
    var el = this.container.querySelector('.note-inline-branch-list');
    if (el) {
        el.parentNode.removeChild(el);
        e.target.closest('button').classList.remove('active');
    } else {
        var t = new NoteInlineBranchList(this);
        this.container.appendChild(t.container);
        t.loadBranches();
        e.target.closest('button').classList.add('active');
    }
};

/***********************************************************************
**
** NodeList -- A list view of notes
**
** This is a list controller. 
** 
** - v: the viewer object
***********************************************************************/


function NoteList (v)
{
    const self = this;

    self.viewer = v;
    var mux = v.space.mux;
    var container = document.createElement("div");
    container.className = "list-container";
    self.container = container;
    self.notes = [];
    
    /* ------------------------------------------------------------ */
    self.saveNotes = function() {
        self.notes.forEach(function(note) {
            self.saveNote(note);
        });
    };

    self.saveNote = function(note) {
        if (note.newContent.countBytes() > 2000) {
            app.err('note is too long: ' + note.newContent.countBytes() + ' bytes(max: 2000)');
            return;
        }
        if (note.revhash && note.lastModified) {
            note.saving = true;
            mux.request('space!', [
                "update-note",
                note.hash,
                "",
                note.newContent
            ], function(r) {
                didSaveNote(note,r,false);
            });
        } else if (!note.ctime && note.lastModified &&
                   note.newContent && note.newContent.length > 0) {
            // New note
            note.saving = true;
            mux.request('space!', [
                "create-note",  
                note.action,
                note.target, 
                note.origin,
                note.newContent
            ], function(r) {
                didSaveNote(note,r,true);
            });
        }
    }; // End of saveNote
    

    function didSaveNote(note, r, created) {
        note.saving = false;
        if (!r)
            return;
        note.lastModified = null;
        note.content = note.newContent;
        note.newContent = null;

        if (created) {
            note.revhash = r.hash;
            note.hash = r.hash;
            note.ctime = r.ctime;
            note.mtime = r.mtime;
            if (v.data.mode == 'add-branch' || v.data.mode == 'add-root') {
                v.data.mode = 'default';
                v.data.noteId = note.hash;
            }
        } else {
            note.revhash = r.revhash;
        }

        if (note == self.notes[0]) {
            if (!v.data.title)
                v.setTitle(note.controller.subject());
        }
        
        note.controller.updateView(created);
        v.didNoteChange();
    }

    /* ---------------------------------------------------------------------- */
    function addNote(item) {
        var note = new Note(self, item);
        container.appendChild(note.container);
        return note;
    }

    self.getBaseNoteId = function() {
        if (v.data.noteId)
            return v.data.noteId;
        if (mux.currentUser && mux.currentUser.firstnote)
            return mux.currentUser.firstnote;
        return null;
    };

    self.loadNotes = function() {
        var noteId = self.getBaseNoteId();
        if (noteId) {
            mux.request('space', ['list-notes', noteId],
                        function(r) {
                            self.didLoadNotes(r);
                        });
        }
    };

    /* ---------------------------------------------------------------------- */
    self.isModified = function() {
        for (var i = 0; i < self.notes.length; i++) {
            if (self.notes[i].newContent)
                return true;
        }
        return false;
    };
    
    self.addNewNote = function(prevElement, exhash) {
        var data = {
            lastModified: unixtime(),
            action : "add",
            target : exhash,
            creator: v.space.mux.currentUser.uuid,
            origin : "",
            content: ""
        };
        for (var i = 0; i < self.notes.length; i++) {
            if (self.notes[i].hash == exhash) {
                self.notes.splice(i+1, 0, data);
                var noteItem = new Note(self, data);
                container.insertBefore(noteItem.container,
                                       prevElement.nextSibling);
                noteItem.beginEdit();
                noteItem.appendText(findAutoMentions(self.notes[i]));
            }
        }
    };

    self.didLoadNotes = function(r) {
        self.notes = r;
        r.forEach(addNote);
        if (self.notes.length > 0) {
            var a = self.notes[0].container.controller;
            var title =  a.subject();
            v.didFirstNote(self.notes[0]);
            if (!v.data.title)
                v.setTitle(title);
        }
    };

    self.findFollowingNotes = function(x) {
        var a = [];
        for (var i = 0; i < self.notes.length; i++) {
            if (self.notes[i].threadid == x)
                a.push(self.notes[i]);
        }
        return a;
    };

    self.actionBarForNote = function(note) {
        var el;
        if (note.hash && !note.lastModified) {
            el = cloneTemplate('tpl-note-action-bar');
            if (v.space.mux.currentUser.uuid != note.creator)
                el.find('#edit').hide();
            else
                el.find('#edit').onclick = function(e) {
                    note.controller.beginEdit();
                };
                
            if (!note.commentid && !self.isCommentList) {
                el.find('#add').onclick = function() {
                    self.addNewNote(note.container, note.hash);
                };
                el.find('#branch').onclick = function(e) {
                    note.controller.toggleBranch(e);
                };

                if (note.branches)
                    el.find('#branch').appendChild(document.createTextNode(note.branches));
                el.find('#comment').onclick = function() {
                    v.openComments(note);
                };
                if (note.comments)
                    el.find('#comment').appendChild(document.createTextNode(note.comments));
            } else {
                el.find('#add').classList.add('collapse');
                el.find('#branch').classList.add('collapse');
                el.find('#comment').classList.add('collapse');
            }

            var btnFav = el.find('#fav');
            btnFav.onclick = function() {
                toggleFavorite(v, note);
            };
            if (note.isfav) btnFav.classList.add('active');

            var btnMore = el.find('#more');
            btnMore.onclick = function() {
                if (btnMore.classList.contains('active')) {
                    el.find('#more-actions').classList.add('collapse');
                    el.find('#init-actions').classList.remove('collapse');
                    btnMore.classList.remove('active');
                } else {
                    btnMore.classList.add('active');
                    el.find('#more-actions').classList.remove('collapse');
                    el.find('#init-actions').classList.add('collapse');
                }
            };
            el.find('#history').onclick = function() {
                v.openHistory(note);
            };
            el.find('#move').onclick = function() {
                var dlg = cloneTemplate('tpl-dialog-move-note');

                dlg.find('#noteid').textContent = note.hash.substr(0,8);

                // If there are notes explicitly after this note
                // we should not allow it to move
                var f = self.findFollowingNotes(note.id);
                if (f.length > 0) {
                    dlg.find('#tip').classList.remove('collapse');
                    dlg.find('#following').onclick = function() {
                        v.space.openViewer({
                            type: 'note',
                            noteId: note.hash
                        }, v);
                    };
                }
                
                dlg.find('#target').onchange = function(e) {
                    v.space.mux.request('space', [
                        'get-note-subject',
                        e.target.value
                    ], function(x) {
                        if (x.subject) {
                            dlg.find('#subject').classList.remove('collapse');
                            dlg.find('#subject').textContent = x.subject;
                            dlg.find('#move').disabled = false;
                        } else {
                            dlg.find('#subject').classList.add('collapse');
                            dlg.find('#move').disabled = true;
                        }
                    });
                };
                dlg.find('#move').onclick = function() {
                    var mvtype;
                    dlg.querySelectorAll('input[name=mvtype]').forEach(function(x){
                        if (x.checked)
                            mvtype = x.value;
                    });
                    var target = dlg.find('#target').value.trim();

                    v.space.mux.request('space!', [
                        'move-note', target, note.hash, mvtype
                    ], function(x){
                        if (x.error) {
                            app.err(x.error);
                            return;
                        }
                        v.reload();
                    });
                    v.dismissModal();                                        
                };
                dlg.find('#cancel').onclick = function() {
                    v.dismissModal();
                };
                v.showModal(dlg);
            };

        } else {
            el = document.createElement('div');
            el.className = 'note-action-bar';
            
            if (note.newContent && note.newContent.countBytes() > 2000) {
                var n = note.newContent.countBytes() - 2000;
                var span = document.createElement('span');
                span.className = 'text-danger';
                span.textContent = "+" + n;
                el.appendChild(span);
            }

            el.appendChild(createButton(_t("save"), function(e){
                self.saveNote(note);
            }, null, "Save note"));

            el.appendChild(createButton(_t("edit"), function(e){
                note.controller.beginEdit();
            }, null, "Edit note"));

            if (!note.hash) {
                el.appendChild(createButton(_t("discard"), function(e){
                    self.deleteNewNote(note);
                }));
            } else {
                el.appendChild(createButton(_t("revert"), function(e){
                    note.controller.revert();
                }));
            }
        }

        return el;
    };

    self.deleteNewNote = function(note) {
        for (var i = 0; i < self.notes.length; i++) {
            if (note == self.notes[i]) {
                self.notes.splice(i,1);
                break;
            }
        }
        note.container.parentNode.removeChild(note.container);
        if (self.notes.length == 0) {
            v.close();
        } else {
            v.didNoteChange();
        }
    };

    self.addNewBranch = function(target) {
        var data = {
            creator: v.space.mux.currentUser.uuid,
            lastModified: unixtime(),
            action: "branch",
            target: target,
            origin: "",
            content: ""
        };
        self.notes.push(data);
        var note = new Note(self, data);
        self.container.appendChild(note.container);
        note.beginEdit();

        v.space.mux.request('space', ['get-note', target], function(r) {
            if (r.hash) {
                note.appendText(findAutoMentions(r));
            }
        });
        
    };

    self.addRoot = function(target, content) {
        var data = {
            lastModified: unixtime(),
            action: "add",
            target: "",
            origin: "",
            content: "",
            creator: v.space.mux.currentUser.uuid
        };
        self.notes.push(data);
        var note = new Note(self, data);
        self.container.appendChild(note.container);
        note.beginEdit();
        if (content)
            note.appendText(content);
    };
    
} // End of NoteList

NoteList.prototype.findNoteById = function(id) {
    var a = this.notes;
    for (var i = 0; i < a.length; i++)
        if (a[i].hash && a[i].hash.substring(0,id.length) == id)
            return a[i];
    return null;
};

// note -- the parent note controller instance
function NoteInlineBranchList (note)
{
    var self = this;
    var v = note.viewer;

    self.container = document.createElement("div");
    self.container.className = "note-inline-branch-list";
    
    self.loadBranches = function() {
        var noteId = note.item.hash;
        if (noteId) {
            v.space.mux.request('space',
                                ['list-branches', noteId],
                                didLoadBranches);
        }
    };

    function gotoNote(noteid) {
        v.space.openViewer({
            type: 'note',
            noteId: noteid
        }, v);
    }

    function didLoadBranches(l) {
        l.forEach(function(item) {
            var el = document.createElement("div");
            el.className = "note-inline-branch-item hflex";

            var elSubject = document.createElement("span");
            elSubject.className = "title";
            var subject = item.content.split("\n")[0];
            elSubject.textContent = subject;
            el.appendChild(elSubject);

            var a = document.createElement("a");
            a.className = 'note-ref';
            a.textContent = item.hash.substring(0,8);
            el.appendChild(a);

            self.container.appendChild(el);
            el.onclick = function(e) { gotoNote(item.hash); };
        });
        self.container.appendChild(createButton("+branch", function(e) {
            v.space.openViewer({
                type: 'note',
                mode: 'add-branch',
                target: note.item.hash
            }, v);
        }));
    }
}

function NoteCommentList (v)
{
    const self = this;

    NoteList.apply(self, [v]);
    self.isCommentList = true;
    
    self.loadNotes = function() {
        var noteId = self.getBaseNoteId();
        if (noteId) {
            v.space.mux.request('space', ['list-comments', noteId],
                                function(r) {
                                    r.forEach(function(item){
                                        item.isComment = true;
                                    });
                                    if (r.length == 0)
                                        self.addNewNote();
                                    else
                                        self.didLoadNotes(r);
                        });
        }
    };

    self.addNewNote = function() {
        var data = {
            isComment: true,
            creator: v.space.mux.currentUser.uuid,
            lastModified: unixtime(),
            action: "annotate",
            target: v.data.noteId,
            origin: "",
            content: ""
        };
        self.notes.push(data);
        var note = new Note(self, data);
        self.container.appendChild(note.container);
        note.beginEdit();

        v.space.mux.request('space', ['get-note', v.data.noteId], function(r) {
            if (r.hash) {
                note.appendText(findAutoMentions(r));
            }
        });
        
    };

    v.toolbar.addButton("+comment", function(e) {
        self.addNewNote();
    });
}

/***********************************************************************
 *
 * NoteInputBar -- file/image/voice/video upload
 *
 **********************************************************************/

function NoteInputBar(v, note) {
    var self = this;
    var c = cloneTemplate('tpl-note-input-bar');
    self.container = c;

    var imageUpload = c.find('#imageUpload');
    var videoUpload = c.find('#videoUpload');
    c.find('#more').onclick = function() {
        if (c.find('#buttons').classList.contains('collapse')) {
            c.find('#buttons').classList.remove('collapse');
        } else {
            c.find('#buttons').classList.add('collapse');
        }            
    };
    c.find('#done').onclick = function() {
        note.endEdit();
    };
    c.find('#add-text').onclick = function() {
        var viewer = v.space.openViewer({
            type: 'textedit'
        }, v);
        viewer.on('did-save', function(path) {
            var t = "[text:" + path + "]";
            note.appendText(t);
        });
    };
    c.find('#mention').onclick = function() {
        var range = note.getSelectedRange();
        var viewer = v.space.openViewer({
            type: 'user-picker'
        }, v);
        viewer.on('did-pick', function(uuid) {
            var t = " @" + uuid.substring(0,6) + " ";
            note.insertText(t, range);
        });
    };
    c.find('#add-image').onclick = function() {
        imageUpload.click();
    };
    c.find('#add-diagram').onclick = function() {
        var viewer = v.space.openViewer({
            type: 'diagram'
        }, v);
        viewer.on('did-save', function(path) {
            note.appendText("[diagram:" + path + "]");
        });
    };
    c.find('#add-drawing').onclick = function() {
        var viewer = v.space.openViewer({
            type: 'quickdraw'
        }, v);
        viewer.on('did-save', function(path) {
            note.appendText("[quickdraw:" + path + "]");
        });
    };
    c.find('#add-file').onclick = function() {
        var viewer = v.space.openViewer({
            type: 'filechooser'
        }, v);
        viewer.on('did-upload', function(path, file) {
            var attrs = [];
            if (file.type)
                attrs.push('type='+file.type);
            if (file.name)
                attrs.push('name='+file.name);
            if (file.size)
                attrs.push('size='+file.size);
            var s;
            if (file.type == 'application/pdf') {
                s = "[pdf:" + file.name.substr(0, file.name.lastIndexOf('.')) + "," + path + "]";
            } else {
                s = "[file:" + path;
                if (attrs.length > 0)
                    s += ":" + attrs.join(',');
                s += "]";
            }
            note.appendText(s);
        });
    };
    c.find('#copy-src').onclick = function() {
        copyToClipboard(note.getCurrentContent());
        app.echo("Text copied");
    };
//    c.appendChild(createButton("video", function(e) {
//        videoUpload.click();
//    }));


    function onVoiceStart() {
        btnVoice.innerHTML = "stop";
        btnVoice.onclick = onVoiceStop;
        recordVoice();
    }

    function onVoiceStop() {
        btnVoice.innerHTML = "voice";
        btnVoice.onclick = onVoiceStart;
        stopVoiceRecording(function(file) {
            console.log("voice:", file.type + "," + file.size + "," + file.name);
            uploadFile(file);
        });
    }

//    var btnVoice = createButton("voice", onVoiceStart);
//    c.appendChild(btnVoice);


    function uploadFile(file) {
        const reader = new FileReader();  
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", function(e) {
            if (e.lengthComputable) {
                const percentage = Math.round((e.loaded * 100) / e.total);
                app.echo("upload:"+ percentage + "%," + e.loaded + "/" + e.total);
            }
        }, false);

        xhr.upload.addEventListener("load", function(e){
            app.echo("upload: completed");
        }, false);

        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 400) {
                // Success!
                var data = JSON.parse(xhr.responseText);
                if (/^image\//i.test(file.type)) {
                    note.appendText("[image:"+data.path+"]");
                } else if (/^video\//i.test(file.type)) {
                    note.appendText("[" + file.type + ":" + data.path + "]");
                } else if (/^audio\//i.test(file.type)) {
                    note.appendText("[" + file.type + ":" + data.path + "]");
                } else if (file.type) {
                    note.appendText("[" + file.type + ":" + data.path + "]");
                } else {
                    note.appendText("[file:" + data.path + "]");
                }
            }
            else {
                app.echo("error upload");
            }
        };

        xhr.onerror = function(e) {
            app.echo("error upload: connection?");
        };
        
        xhr.open("POST", "/api/files/upload");
        xhr.setRequestHeader('Content-Type', file.type ? file.type : 'application/octet-stream');
        reader.onload = function(evt) {
            xhr.send(evt.target.result);
        };
        reader.readAsArrayBuffer(file);
    }

    imageUpload.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (file) {
	    if (/^image\//i.test(file.type)) {
	        uploadFile(file);
	    } else {
	        alert('Not a valid image!');
	    }
        }
    });

    videoUpload.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (file) {
            console.log("selected file:", file);
            //                newNote.innerHTML = file.type + "," + file.size + "," + file.name;
	    uploadFile(file);
        }
    });
}


/***********************************************************************
 * 
 * Note Viewer
 *
 * options:
 *  - noteId: optional, by default, current user's first note
 *  - mode: default is linear, can be: branch/comment/history
 *
 **********************************************************************/
registerViewer('note', {
    name: "note",
    load: function() {
	var v = this;
        var mode = v.data.mode ? v.data.mode : 'default';
	var mux = v.space.mux;

        var vc = cloneTemplate('tpl-note-viewer');

        var noteList;
        switch (mode) {
        case 'comment':
            noteList = new NoteCommentList(v);
            break;
        case 'revision':
            noteList = new NoteRevisionList(v);
            break;
        case 'copies':
            noteList = new NoteCopyList(v);
            break;
        case 'add-branch':
        case 'add-root':
        default:
            noteList = new NoteList(v); 
            break;
        }

        vc.find('#note-list-container').appendChild(noteList.container);

        function openNoteViewerInPlace(hash)
        {
            var lv = v.leftNeighbor();
            var noteExists = false;
            if (lv && lv.data.type == 'note') {
                var x = lv.findNote(hash);
                if (x) {
                    noteExists = true;
                    if (x.container)
                        x.container.scrollIntoView();
                }
            }
            if (!noteExists) {
                v.openNote(hash);
            }
            v.close();
        }

        v.findNote = function (hash) {
            return noteList.findNoteById(hash);
        };
        
        v.didFirstNote = function (firstNote) {
            // show the up-nav if our left neighbor is not our parent
            var id = firstNote.commentid||firstNote.parentid||firstNote.threadid;
            vc.find('#up-nav').hide();
            if (firstNote.commentid || firstNote.parentid) {
                mux.request('space', ['get-note-by-id',id], function(r) {
                    if (r.hash) {
                        vc.find('#up-nav').onclick = function() {
                            openNoteViewerInPlace(r.hash);
                        };
                        if (firstNote.commentid) {
                            vc.find('#up-nav').show();
                            vc.find('#up-nav i').classList.add('fa-arrow-left');
                            vc.find('#up-title').textContent = r.subject;
                        } else if (firstNote.parentid) {
                            vc.find('#up-nav').show();
                            vc.find('#up-nav i').classList.add('fa-arrow-left');
                            vc.find('#up-title').textContent = r.subject;
                        }
                    }
                });
            } else if (firstNote.threadid) {
                v.space.mux.request('space', ['get-thread-first',id], function(r) {
                    if (r.hash) {
                        vc.find('#up-nav').onclick = function() {
                            openNoteViewerInPlace(r.hash);
                        };
                        vc.find('#up-nav').show();
                        vc.find('#up-nav i').classList.add('fa-arrow-up');
                        vc.find('#up-title').textContent = r.subject;
                    }
                });
            }
        };
        
        v.didNoteChange = function() {
            mux.dispatch('did-update-notes', [mux.currentUser.uuid]);
        };

        v.openNote= function(noteHash) {
            v.space.openViewer({
                type: 'note',
                noteId: noteHash
            }, v);
        };

        v.openBranches = function(noteHash) {
            v.space.openViewer({
                type: 'note',
                noteId: noteHash,
                mode: 'branch'
            }, v);
        };

        v.openComments = function(noteItem) {
            v.space.openViewer({
                type: 'note',
                noteId: noteItem.hash,
                mode: 'comment',
                title: "Comments: " + noteItem.controller.subject()
            }, v);
        };

        v.openHistory = function(noteItem) {
            v.space.openViewer({
                type: 'timeline',
                noteId: noteItem.hash
            }, v);
        };
        
        if (v.data.mode=='add-branch') {
            v.setTitle(_t("Add branch"));
            noteList.addNewBranch(v.data.target);
        } else if (v.data.mode == 'add-root') {
            v.setTitle(_t("New note"));
            noteList.addRoot(v.data.target, v.data.content);
        } else {
            noteList.loadNotes();
        }

        if (v.data.title) {
            v.setTitle(v.data.title);
        }
        return vc;
    }
});

function createStandAloneNote(v, noteId)
{
    var el = document.createElement('div');
    el.className = "note-content";
    v.space.mux.request('space', ['get-note', noteId], function(r) {
        if (r.content) {
            renderNote(parseNote(r.content), el, {viewer:v});
        }
    });
    el.onclick = function(e) {
        handleNoteClickEvent(v,e);
    };
    return el;
}

function SearchResultItemView(v, item)
{
    var self = this;
    self.container = document.createElement("div");
    self.container.className = "note-item";

    // Header:  notehash with modified time

    var header = document.createElement("div");
    header.className = "note-header";
    
    var label = document.createElement('span');
    label.className = "note-label";
    label.textContent = item.hash.substring(0,8);
    header.appendChild(label);


    var timeElement = document.createElement("span");
    timeElement.textContent = moment.unix(item.mtime).fromNow();
    header.appendChild(timeElement);
    
    self.container.appendChild(header);

    // Build the note content 
    var x = document.createElement("div");
    x.className = "note-content";
    var t = item.content;
    var offset = 0;
    var m = t.match(/\<.+?\>/g);
    var parts = [];
    if (m) {
        for (var i = 0; i < m.length; i++) {
            var j = t.indexOf(m[i], offset);
            var s = t.substring(offset, j);
            parts.push(s);
            // Get rid of the angle brackets
            parts.push(m[i].substr(1,m[i].length-2));
            offset = j + m[i].length;
        }
        if (offset < t.length) {
            parts.push(t.substring(offset));
        }
    } else {
        parts.push(t);
    }

    for (var i = 0; i < parts.length; i++) {
        if (i % 2 == 0) {
            if (parts[i].length > 0)
                x.appendChild(document.createTextNode(parts[i]));
        } else {
            var span = document.createElement('span');
            span.textContent = parts[i];
            span.className = "text-highlight";
            x.appendChild(span);
        }
    }

    x.onclick = function(e) {
        if (!handleNoteClickEvent(v, e)) {
	    v.space.openViewer({
		type:'note',
		noteId: item.hash
	    }, v);
	    return true;
	}
    };
    self.container.appendChild(x);
}


registerViewer('note-search', {
    name: "note-search",
    load: function() {
        var v = this;
        
        var mux = v.space.mux;

        var vc = cloneTemplate('tpl-note-search');
        var searchList = vc.find("#result-list");
        var inputText = vc.find("#search-text");
        var btnSearch = vc.find("#search-btn");

        inputText.addEventListener("keyup", function(event) {
            if (event.keyCode === 13) { // Enter
                event.preventDefault();
                btnSearch.click();
            }
        });
        
        btnSearch.onclick = function() {
            var text = inputText.value.trim();
            if (text.length == 0)
                return;
            v.setTitle(_t('Search') + ': ' + text);
            var tokens = text.split(/\s+/).map(function(x){
                if (x.charAt(0)=='@'||x.charAt(0)=='#') {
                    if (x.charAt(x.length-1)=='*') {
                        return '"'+x.substring(0,x.length-1)+'"*';
                    } else {
                        return '"'+x+'"';
                    }
                } else {
                    return x;
                }
            });
            text = tokens.join(' ');
            
            searchList.empty();
            searchList.appendChild(createSpinner());
            mux.request('space', [
                'search-notes',
                text,
                0,
                10,
                v.data.sort?v.data.sort:false
            ], function(x) {
                searchList.empty();
                if (x.length) {
                    app.echo("Found " + x[0]);
                    x[1].forEach(function(item){
                        var y = new SearchResultItemView(v, item);
                        searchList.appendChild(y.container);
                    });
                } else {
                    app.echo("Not found");
                }
            });
        };

        if (v.data.text) {
            inputText.value = v.data.text;
            btnSearch.click();
        } else {
            setTimeout(function(){
                inputText.focus();
            },100);
        }
        return vc;
    }
});
