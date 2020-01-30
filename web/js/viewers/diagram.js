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

function drawArrow(ctx, x1, y1, x2, y2, r) {
    var angle;
    var x;
    var y;
    
    ctx.beginPath();

    angle = Math.atan2(y2-y1, x2-x1);

    angle += Math.PI * 5/6;
    x = x2 + r * Math.cos(angle);
    y = y2 + r * Math.sin(angle);
    ctx.moveTo(x, y);

    ctx.lineTo(x2, y2);
    
    angle += Math.PI/3;
    x = x2 + r * Math.cos(angle);
    y = y2 + r * Math.sin(angle);
    ctx.lineTo(x, y);

    ctx.stroke();
}

/*************************************************************
 *
 * DiagramView
 *
 *************************************************************/

function DiagramView(d, options) {
    options = options||{mode:'preview'};
    const mode = options.mode;
    const v = options.viewer;
    const vc = (mode=='design' && v) ? v.contentElement : null;
    const self = this;
    const dc = document.createElement('div');
    const scroller = options.scroller || vc.find('.diagram-scroller');
    dc.className = 'diagram-container';
    self.container = dc;
    self.data = d;
    const nodeElements = {};
    const canvas = document.createElement('canvas');
    self.container.appendChild(canvas);
    canvas.width = d.width;
    canvas.height = d.height;
    var ctx = canvas.getContext('2d');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    var selectedPath = null;
    var selectedNodes = [];
    var shouldShowGrids = true;
    
    // ------------------------------------------------------------
    // Pointer State
    var activeAnchorPoint = null;    
    var selectedPoint = null;    
    var isMoved = false;
    var isBegan = false;
    var activeNode = null;
    var isPointerDownInCanvas = false;
    var lastClientPos = null;
    var originClientPos = null;

    function getTouchPos(el, e) {
        var rect = el.getBoundingClientRect();
        return {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top
        };
    }

    function setSelectedPath(p) {
        selectedPath = p;
        vc.find('#control').hideAll();
        vc.find('#path-control').show();
        vc.find('select#path-arrow').value = p.arrow || '';
        vc.find('select#path-line-width').value = p.lineWidth || 2;
        vc.find('select#path-color').value = p.color || '#000';
    }
    
    function getCoordFromPoint(pt) {
        var x, y;
        if (pt.ref == 'coord') {
            x = pt.x;
            y = pt.y;
        } else if (pt.ref == 'node') {
            var node = getNode(d, pt.node);
            if (!node) {
                console.log("Bad point", pt);
                return null;
            }
            var el = nodeElements[node.id];
            x = node.x + el.offsetWidth * (pt.x||0);
            y = node.y + el.offsetHeight * (pt.y||0);
        }
        return {x: x, y: y};
    }

    // Construct a path object on canvas from the specification.
    // Return the coords of end points and control points on this path
    // for the convenience of our caller.
    function tracePath(path) {
        ctx.beginPath();
        var coords = [];
        var n = path.points.length;
        for (var i = 0;i < n; i++) {
            var pt = path.points[i];
            var coord = getCoordFromPoint(pt);
            var x = coord.x;
            var y = coord.y;
            coords.push({
                x: x, y:y
            });
            if (i == 0) {
                ctx.moveTo(x, y);
            } else if (pt.ctrl) {
                if (pt.ctrl == 'bezier') {
                    ctx.bezierCurveTo(
                        coords[i-2].x,
                        coords[i-2].y,
                        coords[i-1].x,
                        coords[i-1].y,
                        coords[i].x,
                        coords[i].y);
                } else {

                }
            } else {
                ctx.lineTo(x, y);
            }
        }

        if (path.close) {
            ctx.closePath();
        }
        return coords;
    }
    
    function isPointOnPath(path, pos) {
        tracePath(path);
        return ctx.isPointInStroke(pos.x, pos.y);
    }
    
    // Return the path at pos
    // we use fattened line width 
    function hitTest(pos, r) {
        ctx.lineWidth = r || 8;

        if (selectedPath)
        {
            if (hitTestInPath(selectedPath, pos, r) ||
                isPointOnPath(selectedPath, pos))
                return selectedPath;
        }

        for (var j = 0; j < d.paths.length; j++) {
            var path = d.paths[j];
            if (isPointOnPath(path, pos))
                return path;
        }
        return null;
    }

    function hitTestInPath(path, pos, r) {
        var n = path.points.length;
        var j = -1;
        var w = 10000;
        for (var i = 0; i < n; i++) {
            var coord = getCoordFromPoint(path.points[i]);
            var dx = pos.x - coord.x;
            var dy = pos.y - coord.y;
            var t = dx*dx + dy*dy;
            if (t < w) {
                w = t;
                j = i;
            }
        }
        if (w < r*r) {
            return path.points[j];
        } else {
            return null;
        }
    }

    function getNode(d, id) {
        var el = nodeElements[id];
        if (el)
            return el.dgnode;
        else
            return null;
    }

    function addNewTextNode(d,text,x,y) {
        var t = {
            id: generateUUID(),
            type: 'text',
            text: text,
            x: x,
            y: y
        };
        d.nodes.push(t);
        return t;
    }

    function addNewPath(d, points) {
        var t = {
            id: generateUUID(),
            action: 'stroke',
            points: points
        };
        d.paths.push(t);
        return t;
    }



    function beginEdit(el) {
        el.setAttribute('contenteditable', true);
        el.classList.add('editing');

        el.empty();
        var t = document.createElement('span');
        t.textContent = el.dgnode.text;
        el.appendChild(t);
        el.focus();
    }

    function endEdit(el) {
        var s = extractNoteContent(el);
        el.setAttribute('contenteditable', false);
        el.classList.remove('editing');
        el.dgnode.text = s;
        el.empty();
        renderNote(parseNote(s), el, {viewer:self});

        setTimeout(renderPaths, 0);
    }

    

    function setSelectedNode(nodeElement) {
        selectedNodes.forEach(function(x){
            if (x != nodeElement)
                x.classList.remove('selected');
        });
        selectedNodes = [];
        if (nodeElement) {
            nodeElement.classList.add('selected');
            selectedNodes.push(nodeElement);
            if (nodeElement.dgnode.type == 'text') {
                vc.find('#control').hideAll();
                vc.find('#text-control').show();
                vc.find('select#text-border').value = nodeElement.dgnode.border || 'default';
            }
        }
    }

    function initControls() {
        vc.find('select#canvas-size').value = d.width + 'x' + d.height;
        
        vc.find('select#text-border').onchange = function(e) {
            if (selectedNodes.length > 0 && selectedNodes[0].dgnode.type=='text') {
                if (this.value == 'default') {
                    selectedNodes[0].classList.remove('diagram-node-border-none');
                } else {
                    selectedNodes[0].classList.add('diagram-node-border-none');
                }
                selectedNodes[0].dgnode.border = this.value;            
            }
        };

        vc.find('button#edit').onclick = function() {
            if (selectedNodes.length > 0 && selectedNodes[0].dgnode.type=='text') {
                if (!selectedNodes[0].classList.contains('editing'))
                    beginEdit(selectedNodes[0]);
            }
        };
        vc.find('button#done').onclick = function() {
            if (selectedNodes.length > 0 && selectedNodes[0].dgnode.type=='text') {
                if (selectedNodes[0].classList.contains('editing'))
                    endEdit(selectedNodes[0]);
            }
        };
        vc.find('button#delete-node').onclick = function() {
            if (selectedNodes.length > 0 && selectedNodes[0].dgnode.type=='text') {
                removeNode(selectedNodes[0]);
                unselectAll();
            }
        };

        vc.find('button#delete-path').onclick = function() {
            if (selectedPath) {
                for (var i = 0; i < d.paths.length; i++) {
                    if (d.paths[i] == selectedPath) {
                        d.paths.splice(i, 1);
                        break;
                    }
                }
                unselectAll();
            }
        };

        vc.find('select#canvas-size').onchange = function(e) {
            var size = this.value.split('x');
            canvas.width = size[0];
            canvas.height = size[1];
            d.width = canvas.width;
            d.height = canvas.height;
            renderPaths();
        };

        vc.find('input#show-grids').onchange = function() {
            shouldShowGrids = this.checked;
            renderPaths();
        };

        vc.find('select#path-arrow').onchange = function(e) {
            if (selectedPath) {
                selectedPath.arrow = this.value;
                renderPaths();
            }
        };

        vc.find('select#path-line-width').onchange = function(e) {
            if (selectedPath) {
                selectedPath.lineWidth = parseFloat(this.value);
                renderPaths();
            }
        };

        vc.find('select#path-color').onchange = function(e) {
            if (selectedPath) {
                selectedPath.color = this.value;
                renderPaths();
            }
        };
    }
    
    function removeNode(el) {
        for (var i = 0; i < d.paths.length; i++) {
            var path = d.paths[i];
            for (var j = 0; j < path.points.length; j++) {
                var pt = path.points[j];
                if (pt.ref == 'node' && pt.node == el.dgnode.id) {
                    var coord = getCoordFromPoint(pt);
                    pt.ref = 'coord';
                    pt.x = coord.x;
                    pt.y = coord.y;
                }
            }
        }
        for (var i = 0; i < d.nodes.length; i++) {
            if (d.nodes[i] == el.dgnode) {
                console.log("remove node ", d.nodes[i].id);
                d.nodes.splice(i,1);
                break;
            }
        }
        el.parentNode.removeChild(el);
    }

    function unselectAll() {
        vc.find('#control').hideAll();
        vc.find('#general-control').show();
        if (selectedNodes.length > 0) {
            selectedNodes.forEach(function(x){
                x.classList.remove('selected');
            });
            selectedNodes=[];
        }
        selectedPoint = null;
        selectedPath = null;
        renderPaths();
    }

    function snapToAnchors(type, pos) {
        var a = [
            [0,0],[0,0.5],[0,1],
            [0.5,0],[0.5,1],
            [1,0],[1,0.5],[1,1]
        ];
        var j = -1;
        var w = 1000000;
        for (var i = 0; i < a.length; i++) {
            var dx = pos.x - a[i][0];
            var dy = pos.y - a[i][1];
            var t = dx*dx+dy*dy;
            if (t < w) {
                j = i;
                w = t;
            }
        }
        if (j >= 0)
            return {x: a[j][0], y: a[j][1]};
        else
            return pos;
    }

    function snapInNode(el, pos) {
        selectedPoint.ref = 'node';
        selectedPoint.node = el.dgnode.id;
        pos = snapToAnchors(el.dgnode.type, pos);
        console.log("snap to ", pos.x, pos.y);
        selectedPoint.x = pos.x;
        selectedPoint.y = pos.y;
        renderPaths();
    }
    

    ////////////////////////////////////////////////////////////////
    function getPointerPos(e) {
        if (e.touches)
            return {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            };
        else
            return {x: e.clientX, y: e.clientY};
    }

    function getPointerOffsetInElement(el, clientPos) {
        var rc = el.getBoundingClientRect();
        return {
            x: clientPos.x - rc.left,
            y: clientPos.y - rc.top
        };
    }
    
    function hitTestNode(pos, margin) {
        margin = margin || 0;
        var a = dc.childNodes;
        var x = pos.x;
        var y = pos.y;
        for (var i = 0; i < a.length; i++) {
            var el = a[i];
            if (!el.classList.contains('diagram-node'))
                continue;
            var rect = el.getBoundingClientRect();
            var l = rect.left - margin;
            var r = rect.right + margin;
            var t = rect.top - margin;
            var b = rect.bottom + margin;
            if (x >= l && x < r && y >= t && y < b)
                return el;
        }
        return null;
    }

    function adjustNode(el) {
        // If node is dragged outside canvas, move it back.
        var left = el.offsetLeft;
        var top = el.offsetTop;
        if (left + el.offsetWidth > canvas.width)
            left = canvas.width - el.offsetWidth;
        if (left < 0)
            left = 0;
        if (top + el.offsetHeight > canvas.height)
            top = canvas.height - el.offsetHeight;
        if (top < 0)
            top = 0;

        if (left != el.dgnode.x || top != el.dgnode.y) {
            el.style.left = left + 'px';
            el.style.top = top + 'px';
            el.dgnode.x = left;
            el.dgnode.y = top;
            return true;
        } else {
            return false;
        }
    }

    function resetPointerState() {
        activeAnchorPoint = null;
        activeNode = null;
        lastClientPos = null;
        originClientPos = null;
        isMoved = false;
        isBegan = false;
        selectedPoint = null;
    }

    function onPointerBegan(event) {
        var clientPos = getPointerPos(event);
        lastClientPos = clientPos;
        originClientPos = clientPos;
        isBegan = true;
        var offset = getPointerOffsetInElement(canvas, clientPos);
        var r = event.type=='touchstart'?32:16;
        var path = hitTest(offset, r);
        if (path) {
            setSelectedPath(path);
            selectedPoint = hitTestInPath(path, offset, r);
            renderPaths();
            console.log("pointer began: path");
            event.stopPropagation();
            event.preventDefault();
        } else {
            activeNode = hitTestNode(clientPos);
            if (activeNode) {
                if (activeNode.classList.contains('editing')) {
                    isBegan = false;
                } else {
                    console.log("pointer began: node");
                    event.stopPropagation();
                    event.preventDefault();
                }
            } else {
                console.log("pointer began: canvas");
                // We don't want to text selection happen
                event.stopPropagation();
                event.preventDefault();
            }
        }
    }

    function onPointerMove(event) {
        if (!isBegan) return;
        var pos = getPointerPos(event);
        onPointerDrag(pos, event);
    }

    function onPointerDrag(clientPos, event) {
        var dx = clientPos.x - lastClientPos.x;
        var dy = clientPos.y - lastClientPos.y;
        lastClientPos = clientPos;
        
        if (originClientPos && !isMoved) {
            if (Math.abs(originClientPos.x-clientPos.x) > 3
             || Math.abs(originClientPos.y - clientPos.y) > 3)
            {
                isMoved = true;
            }
        }

        if (selectedPoint) {
            var el = hitTestNode(clientPos);
            if (el) {
                var r = el.getBoundingClientRect();
                var pos = {
                    x: (clientPos.x - r.left)/(r.right-r.left),
                    y: (clientPos.y - r.top)/(r.bottom - r.top)
                };
                pos = snapToAnchors(el.dgnode.type, pos);
                activeAnchorPoint = {
                    ref: 'node',
                    node: el.dgnode.id,
                    x: pos.x,
                    y: pos.y
                };
                console.log("pointer drag point in node:", pos.x, pos.y);
            } else {
                activeAnchorPoint = null;
                console.log("pointer drag point", dx, dy);                
            }
            if (dx != 0 || dy != 0) {
                var r = canvas.getBoundingClientRect();
                selectedPoint.ref = 'coord';
                selectedPoint.x = clientPos.x - r.left;
                selectedPoint.y = clientPos.y - r.top;
                renderPaths();            
            }
        } else if (activeNode) {
            console.log("pointer move node", dx, dy);                
            var x = activeNode.dgnode.x + dx;
            var y = activeNode.dgnode.y + dy;
            activeNode.style.left = x + 'px';
            activeNode.style.top = y + 'px';
            activeNode.dgnode.x = x;
            activeNode.dgnode.y = y;
            renderPaths();
        } else {
            scroller.scrollLeft -= dx;
            scroller.scrollTop -= dy;
        }
    }


    function onPointerEnded(event) {
        if (!isBegan)
            return;
        if (isMoved) {
            onPointerDragEnded(event);
            return;
        }
        console.log("pointer ended");

        // Prevent Touch event from generating mouse events
        event.preventDefault();
        
        // A click or a tap        
        if (activeNode) {
            if (!dc.find('.editing')) {
                if (activeNode.classList.contains('selected')) {
                    if (!handleNoteClickEvent(v, event)) {
                        beginEdit(activeNode);
                    }
                } else {
                    console.log("selected node");
                    setSelectedNode(activeNode);
                    activeNode.cancelClickTime = (new Date()).getTime() + 300;
                }
            } else {
                console.log("editing...");
            }
        } else {
            if (dc.find('.editing')) {
                endEdit(selectedNodes[0]);
            } else {
                var pos = getPointerOffsetInElement(canvas, lastClientPos);
                var path = hitTest(pos, 16);
                if (path) {
                    if (selectedPath != path) {
                        setSelectedPath(path);
                        renderPaths();
                    } else {
                        console.log("already selected");
                    }
                } else {
                    if (selectedNodes.length > 0) {
                        unselectAll();
                    } else if (selectedPath) {
                        unselectAll();
                    } else {
                        showNewObjectDialog(pos);
                    }
                }
            }
        }            
        resetPointerState();
    }

    function onPointerDragEnded(event) {
        var redraw = false;
        console.log("dc pointer up");

        // We have performed dragging,
        // don't want side effects
        event.preventDefault();

        if (selectedPoint) {
            var el = hitTestNode(lastClientPos);
            if (el) {
                var rect = el.getBoundingClientRect();
                var pos = {
                    x: lastClientPos.x - rect.left,
                    y: lastClientPos.y - rect.top
                };
                
                selectedPoint.ref = 'node';
                selectedPoint.node = el.dgnode.id;
                pos = {
                    x : pos.x / el.clientWidth,
                    y: pos.y / el.clientHeight
                };
                pos = snapToAnchors(el.dgnode.type, pos);
                console.log("snap to ", pos.x, pos.y);
                selectedPoint.x = pos.x;
                selectedPoint.y = pos.y;
                redraw = true;
            }
        } else if (activeNode) {
            activeNode.cancelClickTime = (new Date()).getTime() + 300;
            redraw = adjustNode(activeNode);
        }
        
        resetPointerState();

        if (redraw)
            renderPaths();
    }


    function onPointerAbort(event) {
        if (event.target == dc) {
            console.log("pointer abort ", event.type);            
            resetPointerState();
        }
    }
    
    // All events in diagram container are captured first here
    // The nodes can receive events only if we didn't
    // stop propagation.

    function registerDiagramEvents() {
        dc.addEventListener('click', function(e) {
            var el = e.target.closest('.diagram-node');
            // If the diagram node has just been dragged or has just been selected
            // it will have a cancelClickTime set, we should not pass click event on to the node
            if (el && el.cancelClickTime && el.parentNode == dc && (new Date()).getTime() < el.cancelClickTime) {
                e.stopPropagation();
                e.preventDefault(); // IMPORTANT
                console.log("dc cancel click");
            } else {
                console.log("dc click");
            }
        }, true);
        
        dc.addEventListener('touchstart',  onPointerBegan, true);
        dc.addEventListener('touchmove',   onPointerMove,  true);
        dc.addEventListener('touchcancel', onPointerAbort, true);
        dc.addEventListener('touchend',    onPointerEnded, true);
        dc.addEventListener('mouseleave',  onPointerAbort, true);
        dc.addEventListener('mouseup',     onPointerEnded, true);
        dc.addEventListener('mousedown',   onPointerBegan, true);
        dc.addEventListener('mousemove',   onPointerMove,  true);

        // Disable context menu on canvas (right click)
        dc.addEventListener('contextmenu', function(e){e.preventDefault();}, false);
    }

    /* ------------------------------------------------------------ */

    function showNewObjectDialog(pos) {
        var dlg = cloneTemplate('tpl-diagram-add-object');
        dlg.find('#add-text').onclick = function() {
            v.dismissModal();
            var node = addNewTextNode(d, "Text", pos.x, pos.y);                
            dc.appendChild(createNodeElement(node));
        };
        dlg.find('#add-line').onclick = function() {
            addNewPath(d, [
                { ref:'coord',
                  x: pos.x,
                  y: pos.y
                },
                {ref:'coord',
                 x: pos.x + 64,
                 y: pos.y
                }]);
            renderPaths();
            v.dismissModal();
        };

        dlg.find('#add-curve').onclick = function() {
            addNewPath(d, [
                { ref:'coord',
                  x: pos.x,
                  y: pos.y
                },
                { ref:'coord',
                  ctrl: 'cp1',
                  x: pos.x,
                  y: pos.y-32
                },
                { ref:'coord',
                  ctrl: 'cp2',
                  x: pos.x+64,
                  y: pos.y+32
                },
                {ref:'coord',
                 ctrl: 'bezier',
                 x: pos.x + 64,
                 y: pos.y
                }]);
            renderPaths();
            v.dismissModal();
        };

        dlg.find('#cancel').onclick = function() {
            v.dismissModal();
        };
        v.showModal(dlg);
    }
    

    function renderGrids(ctx, w, h, step) {
        ctx.save();
        ctx.beginPath(); 
        for (var x=0;x<=w;x+=step) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        // set the color of the line
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 1;
        // the stroke will actually paint the current path 
        ctx.stroke(); 
        // for the sake of the example 2nd path
        ctx.beginPath(); 
        for (var y=0;y<=h;y+=step) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }

        // for your original question - you need to stroke only once
        ctx.stroke(); 
        ctx.restore();
    }

    function renderPath(path) {
        var n = path.points.length;
        ctx.save();

        var coords = tracePath(path);

        if (path.action=='stroke') {
            if (false && selectedPath == path) {
                ctx.strokeStyle = '#00f';
                ctx.fillStyle = '#00f';
            } else if (path.color) {
                ctx.strokeStyle = path.color;
                ctx.fillStyle = path.color;
            } else {
                ctx.strokeStyle = '#000';
                ctx.fillStyle = '#000';
            }
            if (path.lineWidth) {
                ctx.lineWidth=path.lineWidth;
            } else {
                ctx.lineWidth = 2;
            }
            ctx.stroke();
            var r = 8;
            if (n >= 2) {
                if (path.arrow=='>' || path.arrow=='<>') {
                    var x0 = coords[n-2].x;
                    var y0 = coords[n-2].y;
                    var x1 = coords[n-1].x;
                    var y1 = coords[n-1].y;
                    drawArrow(ctx, x0, y0, x1,y1, r);
                }
                if (path.arrow=='<' || path.arrow=='<>') {
                    var x0 = coords[0].x;
                    var y0 = coords[0].y;
                    var x1 = coords[1].x;
                    var y1 = coords[1].y;
                    drawArrow(ctx, x1, y1, x0,y0, r);
                }
            }
        } else if (path.action='fill') {
            if (selectedPath == path) {
                ctx.fillStyle = '#00f';
            } else if (path.color) {
                ctx.fillStyle = path.color;
            }
            ctx.fill();
        }

        if (selectedPath == path) {
            for (var i = 0; i < n; i++) {
                ctx.beginPath();
                ctx.arc(coords[i].x, coords[i].y, 8, 0, Math.PI*2);
                ctx.lineWidth = 1;
                ctx.strokeStyle = '#00f';
                ctx.stroke();

                ctx.setLineDash([4, 4]);
                switch (path.points[i].ctrl) {
                case 'cp1':
                    ctx.beginPath();
                    ctx.moveTo(coords[i-1].x, coords[i-1].y);
                    ctx.lineTo(coords[i].x, coords[i].y);
                    ctx.stroke();
                    break;
                case 'cp2':
                    ctx.beginPath();
                    ctx.moveTo(coords[i+1].x, coords[i+1].y);
                    ctx.lineTo(coords[i].x, coords[i].y);
                    ctx.stroke();
                    break;
                default:
                    break;
                }
                ctx.setLineDash([]);
            }
        }
        
        ctx.restore();
    }

    function renderPaths() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (mode=='design' && shouldShowGrids) {
            renderGrids(ctx, canvas.width, canvas.height, 16);
        }
        d.paths.forEach(function(path) {
            renderPath(path);
        });
        if (activeAnchorPoint && selectedPoint) {
            var coord = getCoordFromPoint(activeAnchorPoint);
            ctx.beginPath();
            ctx.arc(coord.x, coord.y, 8, 0, Math.PI*2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#00f';
            ctx.stroke();
        }
    }

    function createNodeElement(node) {
        var el = document.createElement('div');
        el.className = 'diagram-node note-content';
        el.dgnode = node;

        if (node.type=='text') {
            el.style.left = node.x + 'px';
            el.style.top = node.y + 'px';
            renderNote(parseNote(node.text), el, {viewer:v});
        }

        if (node.border=='none') {
            el.classList.add('diagram-node-border-none');
        }

        nodeElements[node.id] = el;
        return el;
    }
    

    function render() {
        d.nodes.forEach(function(node) {
            dc.appendChild(createNodeElement(node));
        });
        setTimeout(renderPaths, 1);
    }

    //////////////////////////////////////////////////////////////
    if (mode == 'design') {
        registerDiagramEvents();
        initControls();
    }
    render();
}


registerViewer('diagram', {
    embed: function(note, path) {
        var v = this;
        var el = document.createElement('div');
        el.className = 'embed diagram-scroller';
        if (v)
        {
            el.onclick = function(e) {
                if (handleNoteClickEvent(v, e)) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                var viewer = v.space.openViewer({
                    type: 'diagram',
                    path: path,
                    noSave: !note||!note.replaceText
                }, v);
                if (note && note.replaceText) {
                    viewer.on('did-save', function(newPath) {
                        note.replaceText(path, newPath);
                    });
                }
            };
        }
        loadUrlResource(path, function(data) {
            dg = new DiagramView(
                JSON.parse(data),
                {
                    mode: 'preview',
                    scroller: el,
                    viewer: v
                });
            el.appendChild(dg.container);
        });
        return el;
    },
    
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-diagram');
        return vc;
    },

    loaded: function() {
        const v = this;
        const vc = v.contentElement;
        var dg = null;
        var dtool = vc.find('.diagram-tool');
        var scroller = vc.find('.diagram-scroller');
        v.scrollableElement = scroller;

        if (v.data.path) {
            loadUrlResource(v.data.path, function(data) {
                dg = new DiagramView(
                    JSON.parse(data),
                    {
                        mode: 'design',
                        viewer: v
                    });
                scroller.appendChild(dg.container);
            });
        } else {
            dg = new DiagramView({
                viewer: 'diagram',
                version: 1,
                width: 512,
                height: 512,
                nodes: [],
                paths: []
            }, {
                mode: 'design',
                viewer: v
            });
            scroller.appendChild(dg.container);
        }

        var btnSave = v.toolbar.addButton("save", function() {
            var d = dg.data;
            d.lastModified = unixtime();
            var blob = new Blob([JSON.stringify(d)], {
                type: 'application/json'
            });
            uploadData(v, blob, function(path) {
                console.log("saved", path);
                v.dispatch('did-save', path);
                v.close();
            });
        });
    }

});
