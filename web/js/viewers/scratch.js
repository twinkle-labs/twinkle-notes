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

/***********************************************************************
Designing a collaboration editor.

Let C be the channel all editors will communicate in.
It maintains a one version of history, accepting changes from peers.

Let H be local Editing history, each entry is a text change that is made.
and let k as the last known version number that's agreed upon
by every participator. Initally k = 0, and there is no change.
and let n be the total changes that has been made locally.

When new changes are made locally, they are first added to H.
then the changes will be sent to the C one by one.
when accepted by C, then we can increase k.
If rejected, it means that there are changes that we haven't accepted.
We need to merge those changes,
therefore by transforming our local changes.
if there is any conflict that we can't transform our local changes, 
then we should simply discard our changes all together.

This is based on CodeMirror.

Definition of Text Position.

A text position object contains a line and ch field.

 - line
 - ch

These are zero based.
for example, it might be {ch:0, line:18} if the position is at the beginning of line #19.

Definition of Change. 

from and to are the positions (in the pre-change coordinate system) where the change started and ended

- text: is an array of strings representing the text that replaced the changed range (split by line). 
- removed: ....

We keep the removed here incase we need to discard our local changes.

***********************************************************************/

registerViewer('scratch', {
    load: function() {
	var elContent = document.createElement("div");
	return elContent;
    },
    loaded: function() {
	var v = this;
	var mux = v.space.mux;
	var source = 'v#' + v.id;
	//var ta = document.createElement("textarea");

	var unsent_changes = [];
	var sending = false;
	var version_id = 0;
	var channel_id = -1;
	var originText = "This is a scratch area. Everything written here is\n"
	    + "visible for other people in the space\n"
	    + "Put something interesting here";

	var elContent = v.container.querySelector(".content");
	var editor = CodeMirror(elContent, {
	    value: "hmm",
            mode: "text/plain",
            lineWrapping: true,
	    lineNumbers: true,
	});
	
	v.setTitle("*scratch*");

	function applyChange(change) {
	    var pos = editor.getCursor();
	    editor.setValue(change);
	    //editor.replaceRange(change.text, change.from, change.to, 'setValue');
	    editor.setCursor(pos);
	}

	function sendChanges()
	{
	    if (sending || unsent_changes.length == 0)
		return;
	    sending = true;
	    //var text = JSON.stringify(unsent_changes[0]);
	    while (unsent_changes.length > 1)
		unsent_changes.shift();
	    var text = unsent_changes[0];
	    mux.request("post-channel", [channel_id, source, version_id, text],
			function(r) {
			    sending = false;
			    console.log("post-channel: ver="+version_id+":", r);
			    if (!Array.isArray(r)) {
				return;
			    }
			    if (r.length == 1) {
				console.log("post accepted:", r[0]);
				if (r[0] == version_id+1) {
				    version_id = r[0];
				    unsent_changes.shift();
				    sendChanges();
				}
			    } else if (r.length > 1) {
				var latest_version = r[0];
				version_id = r[0];
				// Check if the changes matches
				// TODO undo local changes
				//for (var i = r.length - 1; i > 0; i--) {
				//var change = JSON.parse(r[i][2]);
				var change = r[1][3];
				applyChange(change);
				//}
				unsent_changes = [];
			    }
			});
	}
	
	function addChange(change) {
	    unsent_changes.push(change);
	    sendChanges();
	}
	
	mux.request("join-channel", ["ch:scratch"], function(r){
	    console.log("join-channel:",r);
	    channel_id = r;
	    addChange(originText);	    
	});
	
	mux.on("ch:scratch", v, function(){
	    //console.log("ch:scratch message:", arguments);
	    switch(arguments[0]) {
	    case 'new-member': break;
	    case 'new-message':
		var mid = arguments[1];
		var msg = arguments[2];
		// Ignore messages sent by ourselves
		if (msg[0] == mux.clientId && msg[1] == source)
		    break;
		var change = msg[3];
		version_id = mid;
		applyChange(change);
		break;
	    default:break;
	    }
	});

	function textChanged(editor, change) {
	    if (change.origin == 'setValue')
		return;
	    //	    console.log("text changed:", change);
	    addChange(editor.getValue());
	}

	editor.setSize(null, "100%");
	editor.setValue(originText);
	editor.on('change', textChanged);
	editor.refresh();
    }
});
