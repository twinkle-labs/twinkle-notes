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

function createNoteContentElement(viewer, content)
{
    var el = document.createElement("div");
    el.className = "note-content";

    renderNote(parseNote(content), el, {viewer:viewer});
    el.onclick = function(e) {
        handleNoteClickEvent(viewer, e);
    };
   
    return el;
}


function createNoteLink(viewer, noteid, name)
{
    var el = document.createElement('a');
    el.className = 'note-ref';

    var t;
    if (noteid.length > 8) {
        t = noteid.substring(0,8);
    } else {
        t = noteid;
    }
    if (name)
        t = name + ":" + t;
    el.textContent = t;
    el.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        viewer.space.openViewer({
            type: 'note',
            noteId: noteid
        }, viewer);
    };
    return el;
}

function NoteLogEntry(viewer, data) {
    var self = this;
    self.view = cloneTemplate("tpl-note-log-item", {
        photo: data.photo,
        name: data.name,
        action: data.action,
        target: data.target ? data.target.substring(0,8) : 'none',
        origin: data.origin ? data.origin.substring(0,8) : 'none',
        ctime: moment.unix(data.ctime).fromNow()
    });
    self.view.item = data;

    var elContent = self.view.find('.note-content');
    elContent.onclick = function(e) {
        e.stopPropagation();
        handleNoteClickEvent(viewer, e);
    };

    self.view.find('#viewoption').onchange = function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.target.value=='preview') {
            renderNote(parseNote(data.content),
                       elContent,
                       {viewer: viewer});
        } else if (e.target.value=='viewsrc') {
            elContent.textContent = data.content;
        } else if (e.target.value=='viewdiff') {
            var old = self.view.nextSibling;
            if (old && old.item.revhash
                && old.item.action != 'move'
                && data.action != 'move')
            {
                if (old.item.content) {
                    elContent.innerHTML = diffString(old.item.content, data.content);
                } else {
                    viewer.space.mux.request('space', [
                        'get-note-rev',
                        old.item.revhash
                    ], function(r) {
                        if (r.id) {
                            old.item.content = r.content;
                            elContent.innerHTML = diffString(r.content, data.content);
                        }
                    });
                }
            }
        }
    };
    
    self.view.onclick = function(e) {
        if (e.target.id=='target') {
            if (data.target)
                viewer.space.openViewer({
                    type: 'note',
                    noteId: data.target
                }, viewer);
            return;
        } else if (e.target.id=='origin') {
            if (data.origin)
                viewer.space.openViewer({
                    type: 'note',
                    noteId: data.origin
                }, viewer);
            return;
        } else if (e.target.id=='viewoption' || e.target.nodeName=='OPTION') {
            // Firefox target is OPTION not select
            return;
        }
 
        var el = self.view.find('#detail');
        if (el.classList.contains('collapse')) {
            el.classList.remove('collapse');
            viewer.space.mux.request('space', [
                'get-note-rev',
                data.revhash
            ], function(r) {
                if (r.id) {
                    data.content = r.content;
                    renderNote(parseNote(data.content),
                               elContent,
                               {viewer: viewer});
                }
            });            
        } else {
            elContent.empty();
            el.classList.add('collapse');
            el.find('#viewoption').value='preview';
        }
    };
}

registerViewer('timeline', {
    load: function() {
        var v = this;

        var vc = cloneTemplate('tpl-note-logs', {
            noteId: v.data.noteId.substring(0,8)
        });
        var elList = vc.find('.list-plain');
        function loadTimeline(cb) {
            v.space.mux.request("space", [
                "list-logs",
                v.data.noteId ? v.data.noteId : false
            ], function(r) {
                elList.empty();
                r.forEach(function(item) {
                    var entry = new NoteLogEntry(v, item);
                    elList.appendChild(entry.view);
                });
                if (cb) {
                    cb();
                }
            });
        }

        loadTimeline();

        return vc;
    },

    unload: function() {


    }
});
