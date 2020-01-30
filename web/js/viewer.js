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

var viewer_id = 0;

const ViewerTypes = {
    'video' : {
            name: "VideoPlayer",
            load: function() {
                const v = this;
                var elContent = document.createElement("div");
                elContent.className = "media-player";
                var video = document.createElement("video");
                v.setTitle(this.data.title || "Media Player");

                var source = document.createElement('source');
                source.type = this.data.videoType ;
                source.src = this.data.url;
                video.appendChild(source);
                
                video.setAttribute('controls', true);
                elContent.style.overflow='scroll';
                elContent.appendChild(video);
                return elContent;
            }
    },
    'audio' : {
            name: "AudioPlayer",
            load: function() {
                const v = this;
                var elContent = document.createElement("div");
                elContent.className = "audio-player";
                var audio = document.createElement("audio");
                v.setTitle(this.data.title || "Audio Player");

                var source = document.createElement('source');
                source.type = this.data.audioType ;
                source.src = this.data.url;
                audio.appendChild(source);
                
//                audio.setAttribute('src', this.data.url);
                audio.setAttribute('controls', true);
//                audio.innerHTML = "Audio not supported";
                elContent.style.overflow='scroll';
                elContent.appendChild(audio);
                return elContent;
            }
    },

    'localvideo': {
            name: "LocalVideo",
            load: function() {
                var elContent = document.createElement("div");
                var video = document.createElement("video");
                video.setAttribute('muted', true);
                video.setAttribute('autoplay', true);
                video.innerHTML = "Video not supported";
                elContent.style.overflow='scroll';
                elContent.appendChild(video);

                navigator.mediaDevices.getUserMedia({video: true, audio: true})
                    .then(function(localStream) {
                        video.muted = true;
                        video.srcObject = localStream;
                        //localStream.getTracks().forEach(track => myPeerConnection.addTrack(track, localStream));
                    })
                    .catch(function(e) {
                        switch(e.name) {
                        case "NotFoundError":
                            alert("Unable to open your call because no camera and/or microphone" +
                                  "were found.");
                            break;
                        case "SecurityError":
                        case "PermissionDeniedError":
                            // Do nothing; this is the same as the user canceling the call.
                            break;
                        default:
                            alert("Error opening your camera and/or microphone: " + e.message);
                            break;
                        }
                    });
                
                return elContent;
            }
    },

    'webpage': {
            name: "WebFrame",
            load: function () {
                var elContent = document.createElement("iframe");
                elContent.setAttribute('src', data.url);
                return elContent;
            }
    },

    'qrcode': {
            name: "QRCode",
            load: function() {
                const v = this;
                const vc = cloneTemplate('tpl-qrcode');
                new QRCode(vc.find('#qrcode'), v.data.text);
                return vc;
            }
    }
};

// If config is a string instead of a viewer implementation,
// then type is an alias.
function registerViewer(type, config) {
    if (ViewerTypes[type]) {
        throw new Error("Viewer already registered: " + type);
    } else {
        if (typeof config == 'string') {
            if (!ViewerTypes[config]) {
                throw new Error("Viewer not registered: " + config);
            }
            ViewerTypes[type] = ViewerTypes[config];
        } else {
            ViewerTypes[type] = config;
        }
    }
}

function didClickInViewer(event) {
    var str = event.target.getAttribute('v-open');
    if (!str)
        return;
    var v = event.target.closest('.viewer');
    var parts = str.split(':');
    var attrs = { type: parts[0]};
    if (parts.length >= 2) {
        parts[1].split(",").forEach(function(x){
            x = x.trim().split('=');
            if (x.length > 1)
                attrs[x[0]] = x[1];
        });
    }
    v.viewer.space.openViewer(attrs, v.viewer);
}

/***********************************************************************
 * Viewer Toolbar
 **********************************************************************/

function ViewerToolbar(v) {
    this.container = cloneTemplate('tpl-viewer-toolbar');
    this.leftContainer = this.container.find('.left');
    this.rightContainer = this.container.find('.right');
    this.viewer = v;
}

ViewerToolbar.prototype.empty = function() {
    this.rightContainer.empty();
//    var el = this.container;
    //    while (el.lastChild && !el.lastChild.classList.contains('viewer-back-button'))
//	el.removeChild(el.lastChild);
};

ViewerToolbar.prototype.addButton = function(title,onclick) {
    var btn = createButton(title,onclick);
    this.rightContainer.appendChild(btn);
//    this.container.appendChild(btn);
    return btn;
};

ViewerToolbar.prototype.addIconButton = function(name,onclick,text,title) {
    var btn = createIconButton(name,onclick,text,title);
    this.rightContainer.appendChild(btn);
//    this.container.appendChild(btn);
    return btn;
};

ViewerToolbar.prototype.addLeftButton = function(title,onclick) {
    var btn = createButton(title,onclick);
    this.leftContainer.appendChild(btn);
//    this.container.appendChild(btn);
    return btn;
};

ViewerToolbar.prototype.addBackButton = function(onclick) {
    var btn = createIconButton('arrow-left',onclick,null, 'back');
    this.leftContainer.appendChild(btn);
    return btn;
};

ViewerToolbar.prototype.addInput = function() {
    var el = document.createElement('input');
    this.rightContainer.appendChild(el);
    return el;
};


Node.prototype.findViewer = function() {
    var c = this.closest('.viewer');
    return c ? c.viewer : null;
};

/***********************************************************************
 *
 * Viewer -- A UI tile with title bar, toolbar, and content area.
 *
 **********************************************************************/
function Viewer(space, data) {
    var self = this;
    self.id = ++viewer_id;
    self.data = data;
    self.space = space;
    self.type = data.type;
    var lastScrollPosition = null;
    var container = document.createElement("div");
    var contentElement = null;
    container.viewer = self;
    self.container = container;
    container.onclick = didClickInViewer;

    container.className = "viewer";
    var dispatchTable = {};

    if (!data.config) {
        if (!ViewerTypes[data.type]) {
            throw new Error("Undefined viewer type: " + data.type);
        } else {
            self.config = ViewerTypes[data.type];
        }
    } else {
        self.config = data.config;
    }
    
    self.on = function(op,cb) {
	if (cb)
	    dispatchTable[op] = cb;
    };

    self.off = function(op) {
	delete dispatchTable[op];
    };

    self.dispatch = function() {
	if (arguments.length > 0) {
	    var op = arguments[0];
	    var elScrollable = self.scrollableElement || contentElement;
	    //console.log("dispatch viewer " + self.type + "#" + self.id + ":" + op + ":", lastScrollPosition);
	    switch (op) {
	    case 'mounted':
		if (lastScrollPosition) {
		    elScrollable.scrollLeft = lastScrollPosition.x * elScrollable.scrollWidth;
		    elScrollable.scrollTop = lastScrollPosition.y * elScrollable.scrollHeight;
		   // lastScrollPosition = null;
		}
		break;
	    case 'unmount':
		if (elScrollable && elScrollable.scrollWidth) {
		    lastScrollPosition =  {
			x: elScrollable.scrollLeft/elScrollable.scrollWidth,
			y: elScrollable.scrollTop/elScrollable.scrollHeight
		    };
		} else {
		    lastScrollPosition = null;
		}
		//console.log("unmount position", lastScrollPosition);		
		break;
	    }

	    var args = Array.prototype.slice.call(arguments, 1);
	    if (self.config[op]) {
		self.config[op].apply(self, args);
	    } else if (dispatchTable[op]) {
		dispatchTable[op].apply(self, args);
	    }
	}
    };

    self.removeFromCell = function() {
	if (self.cell) {
	    self.cell.container.removeChild(self.container);
	    self.cell = null;
	}
    };
    
    function onClickTitlebar (event) {
        self.space.becomeActive(self);
//	if (event.clientX < titlebar.clientWidth/3) {
//	    toggleDropdownMenu('left');
//	} else if (event.clientX < titlebar.clientWidth*2/3) {
	    toggleDropdownMenu('center');
//	} else {
//	    toggleDropdownMenu('right');
//	}
    }

    self.leftNeighbor = function () {
        if (self.cell && self.cell.viewers.length > 0) {
            var a = self.cell.viewers;
            var i = 0;
            for (i = 0; i < a.length; i++) {
                if (a[i] == self) {
                    break;
                }
            }
            if (i > 0)
                return a[i-1];
            else
                return null;
        }
    };


    function onStash(event) {
        if (self.cell && self.cell != self.space.root) {
            if (self.cell.parent) {
                self.cell.parent.removeSubcell(self.cell);
                self.space.stashCell(self.cell);
            }
	}
    }
    function onMax(event) {
	if (self.cell) {
            self.cell.removeViewer(self);
        }
	self.space.showViewer(self, 'top');
    }

    function onSplit(event) {
        if (self.cell) {
            self.cell.split(self);
        }
    }

    function onClose(event) {
        if (self.cell) {
            self.cell.removeViewer(self);
        }
        self.unload();
    }
    
    function onFullscreen(event) {
//	enterFullscreen(contentElement);
  	enterFullscreen(self.container);
    }

    function makeDropdownButton(title, onclick) {
        var el = document.createElement("button");
        el.className = "btn btn-toolbar";
        el.innerHTML = title;
        el.onclick = function(e) {
	    e.stopPropagation();
	    onclick(e);
	    toggleDropdownMenu();
	};
        return el;
    }

    function onReload() {
	self.toolbar.empty();
	if (self.contentElement) {
	    if (self.config.unload) {
		self.config.unload.call(self);
	    }
	    self.container.removeChild(self.contentElement);
	    self.contentElement = null;
	}
	self.setTitle("");
	contentElement = self.config.load.call(self);
        
	if (contentElement) {
            if (!self.title)
                self.setTitle(contentElement.getAttribute('v-title')||'');
            contentElement.classList.add("viewer-content");
            container.appendChild(contentElement);
	}

	self.contentElement = contentElement;

	if (self.config.loaded) {
	    self.config.loaded.call(self);
	}
    }

    self.reload = onReload;

    self.resignActive = function() {
	var el = container.querySelector(".viewer-dropdown");
	if (el)
	{
            self.dismissModal();
	    return;
	}
    };

    function toggleDropdownMenu(alignment) {
	
	var el = container.querySelector(".viewer-dropdown");
	if (el)
	{
            self.dismissModal();
	    return;
	}


	el = document.createElement("div");
	el.className = "viewer-dropdown";
	el.style.textAlign = alignment;

        el.appendChild(makeDropdownButton(_t("reload"), onReload));
                
        if (self.cell.viewers[0] != self) {
	    el.appendChild(makeDropdownButton(_t("split"), onSplit));
        }

	if (self.cell != self.space.root
	    ||self.cell.viewers.length>1
	    ||self.cell.subcells.length>0)
	{
            el.appendChild(makeDropdownButton(_t("max"), onMax));
	}

        // Only the last viewer can be closed
        if (self == self.cell.viewers[self.cell.viewers.length-1]) {
            el.appendChild(makeDropdownButton(_t("close"), onClose));
        }

        self.showModal(el);
	//container.appendChild(el);
    }

    function makeTitlebar(title) {
        var el = document.createElement("div");
        el.className = "titlebar";
        var span = document.createElement("span");
        span.className = "title";
        span.innerHTML = title;
        el.appendChild(span);
        el.onclick = onClickTitlebar;

	var vdots = document.createElement("span");
	vdots.innerHTML = "&#x22ee";
	vdots.className = "titlebar-button";
//	vdots.onclick = toggleDropdownMenu;
	el.appendChild(vdots);

        return el;
    }

    var titlebar = makeTitlebar("");
    container.appendChild(titlebar);
    self.title = "";

    self.setTitle = function(title) {
	self.title = title;
        var el = titlebar.querySelector("div.titlebar > span");
        if (el) {
            el.textContent = title;
        }
    };

    self.toolbar = new ViewerToolbar(self);
    container.appendChild(self.toolbar.container);
    var btnBack = self.toolbar.addBackButton(function() {
	onClose();
    });
    btnBack.classList.add('viewer-back-button');

    // call load() to initialize content element
    if (!self.config.load) {
	throw new Error("Undefined load() for viewer of type " + self.type);
    }
    
    contentElement = self.config.load.call(self);
    if (contentElement) {
        if (!self.title)
            self.setTitle(contentElement.getAttribute('v-title')||'');
        contentElement.classList.add("viewer-content");
        container.appendChild(contentElement);
    }
    self.contentElement = contentElement;

    // TODO get rid of it
    if (self.config.loaded) {
	self.config.loaded.call(self);
    }

}

/* The viewer will not be usable any more */
Viewer.prototype.unload = function() {
    if (this.container) {
        console.log("Unloading viewer#"+this.id, this.title);
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        if (this.config.unload) {
            this.config.unload.call(this);
        }
        this.container.viewer = null;
        this.container = null;
    }
};

Viewer.prototype.close = function() {
    if (this.cell) {
        this.cell.removeViewer(this);
    }
    this.unload();
};

Viewer.prototype.showModal = function(el) {
    var v = this;
    if (this.container.find(".viewer-modal"))
        return;
    var modal = document.createElement('div');
    modal.className = "viewer-modal fade-in";

    el.onclick = function(e) {
        e.stopPropagation();
    };

    modal.appendChild(el);

    modal.onclick = function() {
        v.dismissModal();
    };

    this.container.appendChild(modal);
    this.container.classList.add('active');
};

Viewer.prototype.dismissModal = function() {
    if (this.container) {
        var el = this.container.find(".viewer-modal");
        if (el) {
            this.container.removeChild(el);
        }
        this.container.classList.remove('active');
    }
};

Viewer.prototype.showPrompt = function(options, done) {
    var v = this;
    var dialog = cloneTemplate('tpl-prompt');
    if (options.title) {
        dialog.find('#title').textContent = options.title;
    }
    if (options.message) {
        dialog.find('#message').textContent = options.message;
    }
    var elInput = dialog.find('#prompt-input');
    if (options.text)
        elInput.value = options.text;
    if (options.password)
        elInput.setAttribute('type', 'password');

    if (done) {
        dialog.find('#ok').onclick = function() {
            if (elInput.value.trim().length==0) {
                return;
            }
            v.dismissModal();
            done(elInput.value.trim());
        };
        dialog.find('#cancel').onclick = function() {
            v.dismissModal();
        };
    }
    this.showModal(dialog);
};

Viewer.prototype.showConfirm = function(options, done) {
    var v = this;
    var dialog = cloneTemplate('tpl-confirm');
    if (options.title) {
        dialog.find('#title').textContent = options.title;
    }
    if (options.message) {
        dialog.find('#message').textContent = options.message;
    }
    if (done) {
        dialog.find('#ok').onclick = function() {
            v.dismissModal();
            done(true);
        };
        dialog.find('#cancel').onclick = function() {
            v.dismissModal();
            done(false);
        };
    }
    this.showModal(dialog);
};

//Viewer.prototype.q = function(sel) {
//    return this.container.querySelector(sel);
//};

/***********************************************************************
** Cell - Holding either a single viewer or subcells
**  
** cell = ()
**        | (viewer ... )
**        | (cell ... )
**        ;
**
** Cells must belong to one space. But viewers may be switched
** between different spaces (rarely so).
***********************************************************************/
function Cell(space, options)
{
    var self = this;
    self.space = space;
    var container = document.createElement("div");
    container.className = "viewer-cell vertical";
    container.cell = self;
    var direction = 'auto';

    self.subcells = []; // used only in branch cell
    self.viewers = []; // Used in leaf cell
    self.parent = null;
    self.container = container;

    function empty() {
        while (container.firstChild)
            container.removeChild(container.firstChild);
    }

    function ensureLeaf(t) {
        if (t) {
            if (self.subcells.length > 0)
	        throw new Error("cell not a leaf");
        } else {
            if (self.viewers.length > 0)
                throw new Error("cell not a branch");
        }
    }
    
    // Leaf cell only
    this.setViewers= function(viewers) {
        ensureLeaf(true);
        for (var i = 0; i < self.viewers.length; i++) {
            var v = self.viewers[i];
	    v.removeFromCell();
	    space.addBackViewer(v);
        }
        empty();
        self.viewers = viewers;
        viewers.forEach(function(viewer){
            viewer.cell = self;
            container.appendChild(viewer.container);
        });
    };

    this.addSubcell = function(cell) {
//        ensureLeaf(false);
        self.subcells.push(cell);
        cell.parent = self;
        container.appendChild(cell.container);
    };

    this.removeNextSiblings = function(v) {
        ensureLeaf(true);
        var i = 0;
        for (; i < self.viewers.length; i++) {
            if (self.viewers[i] == v)
                break;
        }

        // Not a sub viewer
        if (i >= self.viewers.length)
            return;

        for (var k = i + 1; k < self.viewers.length; k++)
            self.viewers[k].unload();

        self.viewers = self.viewers.slice(0,i+1);
	autoCollapse();
    };

    this.split = function(from) {
        ensureLeaf(true);
        for (var i = 0; i < self.viewers.length; i++) {
            var v = self.viewers[i];
            if (v == from && i > 0) {
                var first = self.viewers.slice(0,i);
                var second = self.viewers.slice(i);
                empty();
                self.viewers = [];
                var c1 = makeLeafCell(first);
                var c2 = makeLeafCell(second);
                self.addSubcell(c1);
                self.addSubcell(c2);
                return true;
            }
        }
    };

    this.expand = function(v) {
        var i = 0;
        for (; i < self.viewers.length; i++) {
            if (self.viewers[i] == v)
                break;
        }

        // Not our subviewer, ignore it
        if (i >= self.viewers.length)
            return;

        for (i = 0; i < self.viewers.length; i++) {
            if (self.viewers[i] != v) {
                self.viewers[i].unload();
            }
        }
        self.viewers = [v];
    };

    function makeLeafCell(viewers) {
        var cell = new Cell(space, {});
        cell.setViewers(viewers);
        return cell;
    }

    this.addViewer = function(v) {
        //ensureLeaf(true);
        v.cell = self;
        self.viewers = self.viewers.concat(v);
        container.appendChild(v.container);
	autoCollapse();
    };

    this.removeViewer = function(v) {
        ensureLeaf(true);
        for (var i = 0; i < self.viewers.length; i++) {
            if (v == self.viewers[i]) {
                self.viewers.splice(i,1);
                container.removeChild(v.container);
                v.cell = null;
                if (self.viewers.length == 0) {
                    if (self.parent) {
                        self.parent.removeSubcell(self);
                    } else {
                        self.space.bringFirstToFront();
                    }
                }
                break;
            }
        }
	autoCollapse();	
    };

    this.removeSubcell = function(c) {
        for (var i = 0; i < self.subcells.length; i++) {
            if (c == self.subcells[i]) {
                self.subcells.splice(i,1);
                container.removeChild(c.container);
                c.parent = null;

                if (self.subcells.length==0) {
                    if (self.parent) {
                        self.parent.removeSubcell(self);
                    }
                } else if (self.subcells.length == 1) {
                    // move the children up a level
                    var c = self.subcells[0];
		    c.unmount();
                    self.subcells = [];
                    if (c.viewers.length > 0) {
                        self.setViewers(c.viewers);
                    } else {
                        for (var i = 0; i < c.subcells.length; i++) {
                            self.addSubcell(c.subcells[i]);
                        }
                    }
		    self.dispatch('mounted');
                }
                return;
            }
        }
    };

    function adjustDirection() {
        var el = container;
        if (direction == 'auto')
        {
            if (el.clientWidth > el.clientHeight) {
                el.style.flexDirection = 'row';
                el.classList.remove('vertical');
                el.classList.add('horizontal');
            } else {
                el.style.flexDirection = 'column';
                el.classList.remove('horizontal');
                el.classList.add('vertical');
            }
        }
    }

    function autoCollapse() {
	var el = container;
	if (self.viewers.length > 1) {
	    if (el.clientWidth > el.clientHeight) {
		if (el.clientWidth/self.viewers.length < 320) {
		    el.classList.add('collapsed');
		} else {
		    el.classList.remove('collapsed');
		}
	    } else {
		if (el.clientHeight/self.viewers.length < 240) {
		    el.classList.add('collapsed');
		} else {
		    el.classList.remove('collapsed');
		}
	    }
	} else {
	    el.classList.remove('collapsed');
	}
    }
    
    this.setDirection = function(dir) {
        if (direction != dir) {
            direction = dir;
            adjustDirection();
        }
    };
    
    this.onResize = function() {
        adjustDirection();
	autoCollapse();
        self.subcells.forEach(function(cell) {
            cell.onResize();
        });
    };


    if (options.viewer) {
        var viewer = new Viewer(space, options.viewer);
        this.setViewers([viewer]);
    } else if (options.subcells) {
        options.subcells.forEach(function(opt) {
            self.addSubcell(new Cell(space, opt));
        });
    }
}

Cell.prototype.kill = function() {
    var self = this;
    self.viewers.forEach(function(v) {
        v.unload();
    });
    self.viewers = [];
    self.subcells.forEach(function(c) {
        c.kill();
        self.container.removeChild(c.container);
    });
    self.subcells = [];
};

Cell.prototype.isLeaf = function() {
    return this.viewers.length > 0;
};

Cell.prototype.isEmpty = function() {
    return this.viewers.length==0 && this.subcells.length==0;
};

Cell.prototype.dispatch = function() {
    var args = arguments;
    this.viewers.forEach(function(v){
	v.dispatch.apply(v, args);
    });
    this.subcells.forEach(function(c){
	c.dispatch.apply(c, args);
    });
};

// Mount cell element to DOM tree
// el is a DOM element in the DOM tree
Cell.prototype.mount = function(el) {
    el.appendChild(this.container);
    this.onResize();
    this.dispatch('mounted');
    return this;
};

// Unmount cell element from DOM tree
Cell.prototype.unmount = function() {
    if (this.container.parentNode) {
	this.dispatch('unmount');
	this.container.parentNode.removeChild(this.container);
    }
    return this;
};

/***********************************************************************
** Space -- Create a workspace to hold all viewers
**
**  - options :  cell arangement
**  - mux : message exchange

** Properties
**  - root: the root cell
**  - backViewers: viewers in background
***********************************************************************/
function Space(options, mux) {
    var self = this;
    self.mux = mux;
    self.root = new Cell(self, options);
    self.backViewers = [];
    self.container = null;

    self.mount = function(container) {
	if (self.container == null) {
	    self.container = container;
	    self.root.mount(container);
	} else {
	    throw new Error('Already mounted');
	}
    };

    self.openViewer = function (options, from) {
        var viewer = new Viewer(this, options);
	return self.showViewer(viewer,from);
    };
    
    self.showViewer = function (viewer, from) {
        if (self.root.isEmpty())
        {
            self.root.addViewer(viewer);
	    viewer.dispatch('mounted');
            return viewer;
        }
        else if (self.root.viewers.length > 0 && self.root.viewers[0].data.type == 'switcher')
	{
	    // Unmount background cells from thumbnail view first
	    self.backViewers.forEach(function(c) { c.unmount() });
            // Must add the new viewer first because
            // removing the switcher immediately will bring in
            // top back viewer.
	    self.root.addViewer(viewer);
	    self.root.removeViewer(self.root.viewers[0]);
	    return viewer;
	}
        
        if (!from)
            from = 'top-right';
        if (from=='top-right' || from=='top-left') {
            self.root.unmount();

            var newcell = new Cell(self, {});
            newcell.addViewer(viewer);
            var newroot = new Cell(self, {});

            if (from=='top-right') {
                newroot.addSubcell(self.root);
                newroot.addSubcell(newcell);
            } else {
                newroot.addSubcell(newcell);
                newroot.addSubcell(self.root);
            }
	    self.root = newroot;
	    self.root.mount(self.container);
	} else if (from == 'top') {
	    self.backViewers.unshift(self.root);
	    self.root.unmount();
            var newroot = new Cell(self, {});
            newroot.addViewer(viewer);
            self.root = newroot;
            self.root.mount(self.container);
        } else {
            from.cell.removeNextSiblings(from);
            from.cell.addViewer(viewer);
	    from.cell.onResize();
	    viewer.dispatch('mounted');
        }
	return viewer;
    };

    self.showSwitcher = function() {
        if (!self.root.isEmpty()) {
            if (self.root.viewers.length > 0 && self.root.viewers[0].data.type == 'switcher')
	    {
		// show the first one
		if (self.backViewers.length > 0)
		    self.bringToFront(self.backViewers[0]);
                return;
            }
	    self.backViewers.unshift(self.root);
        }
	self.root.unmount();

        var newroot = new Cell(self, {});
        var viewer = new Viewer(self, {
            type:'switcher'
        });
        newroot.addViewer(viewer);
        self.root = newroot;
        self.root.mount(self.container);
    };

    self.testTopViewer = function(type) {
        var v = self.getTopViewer();
        return (v && v.type == type);
    };

    self.getTopViewer = function() {
        if (self.root && self.root.viewers.length > 0)
            return self.root.viewers[0];
        else
            return null;
    };


    self.bringFirstToFront = function() {
        if (self.backViewers.length > 0) {
            self.bringToFront(self.backViewers[0]);
        }
    };

    self.bringToFront = function(cell) {
        var i = self.backViewers.indexOf(cell);
        if (i < 0)
            return;

	// Unmount background cells from thumbnail view first
	self.backViewers.forEach(function(c) { c.unmount() });	
        self.backViewers.splice(i, 1);
	self.root.unmount();
        self.root = cell;
	self.root.mount(self.container);
    };
    
    self.mergeCells = function (cells) {
        cells.forEach(function(c) { self.removeStashedCell(c); });
        var newroot = new Cell(self, {});
        cells.forEach(function(c) {
            newroot.addSubcell(c);
        });
        self.backViewers.unshift(newroot);
        return newroot;
    };
    
    self.stashCell = function (cell) {
        self.backViewers.unshift(cell);
    };

    self.removeStashedCell = function(c) {
        self.backViewers.splice(self.backViewers.indexOf(c), 1);
    };

    // Viewer become active
    self.becomeActive = function (v) {
	var el = self.root.container.querySelector('.viewer.active');
	if (el && el.viewer && el.viewer != v) {
	    el.classList.remove("active");
	    el.viewer.resignActive();
        }
	v.container.classList.add("active");
    };

}

Space.prototype.echo = function(x) {
    app.addLog('info', x);
};
