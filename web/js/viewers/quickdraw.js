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


registerViewer('quickdraw', {
    embed: function(note, path) {
        var v = this;
        var el = document.createElement('img');
        el.className = 'embed quickdraw';
        el.setAttribute('src', path);
        if (v)
        {
            el.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                var viewer = v.space.openViewer({
                    type: 'quickdraw',
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
        return el;
    },
    load: function() {
        var v=this;
        var elContent = document.createElement('div');
        elContent.className = 'quickdraw';
        v.setTitle('Draw quickly');
        var selectMode = createSelect([
            { title: 'Draw', value: 'draw' },
            { title: 'Move', value: 'move' },
            { title: 'Erase', value: 'erase' },
            { title: 'Text', value: 'text' },
            { title: 'Grid', value: 'grid' },
        ]);

        var selectColor = createSelect([
            { title: 'Black', value: '#000000' },
            { title: 'Gray', value: '#808080' },
            { title: 'Red', value: '#ff0000' },
            { title: 'Blue', value: '#0000ff' },
        ]);

        var selectStrokeWidth = createSelect([
            { title: 'Thin', value: '1' },
            { title: 'Medium', value: '2' },
            { title: 'Thick', value: '4' },
            { title: 'Ultra', value: '8' },
        ]);

        var selectSize = createSelect([
            { title: '512x512', value: '512x512' },
            { title: '512x256', value: '512x256' },
            { title: '1024x512', value: '1024x512' },
            { title: '512x1024', value: '512x1024' },
            { title: '1024x1024', value: '1024x1024' },
        ]);

        var selectContainer = document.createElement('div');
        selectContainer.className='quickdraw-tool';
        selectContainer.appendChild(selectMode);
        selectContainer.appendChild(selectColor);
        selectContainer.appendChild(selectStrokeWidth);
        selectContainer.appendChild(selectSize);
        elContent.appendChild(selectContainer);

        var canvasContainer = document.createElement('div');
        canvasContainer.className='canvas-container';
        var canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        canvas.style.background='white';
        canvasContainer.appendChild(canvas);
        elContent.appendChild(canvasContainer);
        v.scrollableElement = canvasContainer;

        /*-------------------------------- */
        var ctx = canvas.getContext('2d');
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        var mode = 'draw';
        var lastPos = null;
        var selectedColor = '#000000';
        var eraser = {
            width: 10,
            height: 10
        };
        var modified = false;

        function onpointerdown(pos) {
            switch (mode) {
            case 'draw':
                lastPos = pos;
                mode = 'draw-began';
                break;
            case 'erase':
                ctx.clearRect(pos.x-eraser.width/2,pos.y-eraser.height/2, eraser.width, eraser.height);
                mode = 'erase-began';
                modified = true;
                break;
            default:
                break;
            }
        }

        function onpointermove(pos) {
            switch (mode) {
            case 'draw-began':
                ctx.beginPath();
                ctx.moveTo(lastPos.x, lastPos.y);
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
                lastPos = pos;
                modified = true;                
                break;
            case 'erase-began':
                ctx.clearRect(pos.x-eraser.width/2,pos.y-eraser.height/2, eraser.width, eraser.height);
                modified = true;
                break;
            default:
                break;
            }
        }

        function onpointerup() {
            switch (mode) {
            case 'draw-began':
                lastPos = null;
                mode = 'draw';
                break;
            case 'erase-began':
                mode = 'erase';
                break;
            default:
                break;
            }
        }

        function getTouchPos(canvasDom, touchEvent) {
            var rect = canvasDom.getBoundingClientRect();
            return {
                x: touchEvent.touches[0].clientX - rect.left,
                y: touchEvent.touches[0].clientY - rect.top
            };
        }
        

        function clear() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            modified = true;
        }

        v.toolbar.addButton("Clear", clear);
        v.toolbar.addButton("Done", function(){
            if (v.data.noSave || !modified) {
                v.close();
            } else {
                canvas.toBlob(function(b) {
                    uploadData(v, b, function(path) {
                        console.log("uploaded", path);
                        v.dispatch('did-save', path);
                        v.close();
                    });
                });
            }
        });

        function extractNoteContent(el)
        {
            var content = "";
            for (var i = 0; i < el.childNodes.length; i++) {
                var node = el.childNodes[i];
                //        console.log("node:",node);
                if (node.tagName == 'DIV' || node.tagName == 'P' || node.tagName == 'BR') {
                    content += "\n" + extractNoteContent(node);
                } else if (node.tagName == 'SPAN') {
                    content += extractNoteContent(node);
                } else {
                    content += node.textContent;
                }
            }
            return content;
        }

        function initCanvasCallbacks(canvas) {

            canvas.addEventListener('click', function(e) {
                var pos = {x: e.offsetX, y: e.offsetY};
                if (mode == 'text') {
                    var textInput = document.createElement('div');
                    textInput.className = "text-input";
                    textInput.contentEditable = true;
                    textInput.style.color = ctx.strokeStyle;
                    textInput.onclick = function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                    };
                    
                    textInput.onblur = function(e) {
                        if (this.textContent.length > 0) {
                            var text = extractNoteContent(this);
                            ctx.font = "16px Helvetica";
                            ctx.fillStyle = ctx.strokeStyle;
                            var lines = text.split("\n");
                            var y = pos.y;
                            for (var i = 0; i < lines.length; i++) {
                                ctx.fillText(lines[i], pos.x, y);
                                y += 20;
                            }
                            modified = true;
                        }
                        this.parentNode.removeChild(this);
                    };
                    textInput.style.left = pos.x-2+"px";
                    textInput.style.top = pos.y-18+"px";
                    canvasContainer.appendChild(textInput);
                    textInput.focus();
                } else if (mode == 'grid') {
                    mode = 'grid-began';
                    lastPos = pos;
                } else if (mode == 'grid-began') {
                    mode = 'grid';
                    var dx = lastPos.x < pos.x ? 16 : -16;
                    var dy = lastPos.y < pos.y ? 16 : -16;
                    var n = Math.floor(Math.abs(lastPos.x-pos.x)/16);
                    var m = Math.floor(Math.abs(lastPos.y-pos.y)/16);
                    for (var i = 0; i < n+1; i++) {
                        ctx.beginPath();
                        ctx.moveTo(lastPos.x+i*dx, lastPos.y);
                        ctx.lineTo(lastPos.x+i*dx, lastPos.y+m*dy);
                        ctx.stroke();
                    }
                    for (var i = 0; i < m+1; i++) {
                        ctx.beginPath();
                        ctx.moveTo(lastPos.x, lastPos.y+i*dy);
                        ctx.lineTo(lastPos.x+n*dx, lastPos.y+i*dy);
                        ctx.stroke();
                    }
                    modified = true;
                }
            });
            
            canvas.addEventListener('mousedown',function(e){
                onpointerdown({x: e.offsetX, y: e.offsetY});
            });
            canvas.addEventListener('mouseup', function(e){
                onpointerup();
            });
            canvas.addEventListener('mousemove', function(e){
                onpointermove({x: e.offsetX, y: e.offsetY});
            });
            
            canvas.addEventListener('touchstart', function(e){
                if (mode == 'draw'||mode=='erase') {
                    e.preventDefault();
                    //            e.stopPropagation();
                    onpointerdown(getTouchPos(canvas, e));
                }
            }, false);
            canvas.addEventListener('touchend', function(e){
                if (mode == 'draw-began' || mode=='erase-began')
                    onpointerup();
            }, false);
            canvas.addEventListener('touchcancel', function(e){
                if (mode == 'draw-began'||mode=='erase-began')
                    onpointerup();
            }, false);
            canvas.addEventListener('touchmove', function(e){
                if (mode == 'draw-began'||mode=='erase-began')
                    onpointermove(getTouchPos(canvas, e));
            }, true);

        }

        initCanvasCallbacks(canvas);
        
        selectColor.onchange = function(e) {
            ctx.strokeStyle = this.value;
            this.style.background=this.value;
            this.style.color ='white';
        };
        selectStrokeWidth.onchange = function(e) {
            ctx.lineWidth = 0+this.value;
        };

        
        selectSize.onchange = function (e) {
            var image = new Image();
            var size = this.value.split('x');
            image.onload = function() {
                console.log("image:", image.width, image.height);
                canvas.width = size[0];
                canvas.height = size[1];
                ctx.drawImage(image, 0, 0, image.width, image.height);
                ctx.lineCap = 'round';
                ctx.lineWidth = selectStrokeWidth.value;
                ctx.strokeStyle = selectColor.value;
                modified = true;
            };
            image.src = canvas.toDataURL();
        };
        selectMode.onchange = function(e) {
            setMode(this.value);
        };

        function setMode(t) {
            mode = t;
            switch (t) {
            case 'draw':
                canvas.style.cursor = 'pointer';
                break;
            case 'move':
                canvas.style.cursor = 'move';
                break;
            case 'grid':
                canvas.style.cursor = 'crosshair';
                break;
            case 'erase':
                canvas.style.cursor = 'grab';
                break;
            case 'text':
                canvas.style.cursor = 'text';
                break;
            default:
                break;
            }
        }
        setMode('draw');

        if (v.data.path) {
            var img = new Image();
            img.onload = function() {
                if (img.width) {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0, img.width, img.height);
                }
            };
            img.src = v.data.path;
        }
        
        return elContent;
    }

});
