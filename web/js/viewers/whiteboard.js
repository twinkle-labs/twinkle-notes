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

registerViewer('whiteboard', {
    name: "Whiteboard",
    load: function() {
	var v = this;
	var mux = v.space.mux;
        var channel = v.data.channel;
        if (!channel)
            throw new Error("bad channel");
        
	v.setTitle(channel+":whiteboard");

	var elContent = document.createElement("div");
	elContent.className = "whiteboard";
	var elCanvas = document.createElement("canvas");
	elContent.appendChild(elCanvas);

	
	elCanvas.setAttribute('width', '512px');
	elCanvas.setAttribute('height', '512px');

	var ctx = elCanvas.getContext('2d');

	function clearCanvas() {
	    ctx.fillStyle = "#eee";
	    ctx.fillRect(0,0,ctx.canvas.width, ctx.canvas.height);
	    ctx.lineWidth = 2;
	    ctx.lineJoin = 'round';
	    ctx.strokeStyle = "#ccc";
	    
	    ctx.moveTo(ctx.canvas.width/2, 0);
	    ctx.lineTo(ctx.canvas.width/2, ctx.canvas.height);
	    ctx.stroke();
	    ctx.moveTo(0, ctx.canvas.height/2);
	    ctx.lineTo(ctx.canvas.width, ctx.canvas.height/2);
	    ctx.stroke();

	    ctx.strokeStyle = "#333333";
	}

	clearCanvas();

	var lastX = 0;
	var lastY = 0;
	var drawing = false;
        var drawEnabled = false;

	function drawLine(x0, y0, x1, y1, should_notify) {
	    ctx.beginPath();
	    ctx.moveTo(x0, y0);
	    ctx.lineTo(x1, y1);
	    ctx.closePath();
	    ctx.stroke();
	    if (should_notify)
		mux.notifyAll(channel, ['wb-line', x0, y0, x1, y1]);
	}

	mux.on(channel, v, function(from, method) {
	    switch (method) {
	    case 'wb-line':
                var x0 = arguments[2];
                var y0 = arguments[3];
                var x1 = arguments[4];
                var y1 = arguments[5];
		drawLine(x0,y0,x1,y1,false);
		break;
	    case 'wb-clear':
		clearCanvas();
		break;
	    default:
		break;
	    }
	});
	
	elCanvas.onmousedown = function(e) {
            if (!drawEnabled)
                return;
	    drawing = true;
	    var mouseX = e.offsetX;// e.pageX - this.offsetLeft;
	    var mouseY = e.offsetY; //e.pageY - this.offsetTop;
	    console.log("mouse down:", mouseX, mouseY);
	    lastX = mouseX;
	    lastY = mouseY;
	};

	elCanvas.onmousemove = function(e) {
	    if (!drawing)
		return;
	    var mouseX = e.offsetX;// e.pageX - this.offsetLeft;
	    var mouseY = e.offsetY; //e.pageY - this.offsetTop;

	    if (mouseX == lastX && mouseY == lastY)
		return;

	    //	    console.log("mouse move:", mouseX, mouseY);
	    drawLine(lastX, lastY, mouseX, mouseY, true);

	    lastX = mouseX;
	    lastY = mouseY;
	};

	elCanvas.onmouseleave = function(e) {
	    drawing = false;
	};

	elCanvas.onmouseup = function(e) {
	    drawing = false;
	};

	v.toolbar.addButton("clear", function(e){
	    clearCanvas();
	    mux.notifyAll(channel, ['wb-clear']);
	});

        var toggle = v.toolbar.addButton("draw", function(e) {
            if (drawEnabled) {
                drawEnabled = false;
                toggle.classList.remove('active');
            } else {
                drawEnabled = true;
                toggle.classList.add('active');
            }
        });
	
	return elContent;
    },

    unload: function() {
        var v = this;
        v.space.mux.off(v.data.channel, v);
    }

});
