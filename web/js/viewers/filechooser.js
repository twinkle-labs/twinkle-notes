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

function FileChooser(viewer, fileType)
{
    var self = this;
    
    var elInput = document.createElement("input");
    elInput.type = 'file';
    if (fileType)
	elInput.setAttribute('accept', fileType);
    elInput.style.display = 'none';


    self.inputElement = elInput;
    
    self.open = function(success) {
	elInput.onchange = function(e) {
            var file = e.target.files[0];
            if (file) {
		console.log("selected file:", file);
		success(file);
            }
	};
	elInput.click();
    };

    self.readAsImage = function(file, success) {
	if (/\.(jpe?g|png|gif)$/i.test(file.name)) {
	    var reader = new FileReader();
	    reader.addEventListener("load", function () {
		var image = new Image();
		image.onload = function(e) {
		    success(image);
		};
		image.src = this.result;
	    }, false);
	    reader.readAsDataURL(file);
	}
    };

    self.uploadFile = function(file, success) {
	const reader = new FileReader();
	reader.onload = function(evt) {
	    self.uploadData(evt.target.result, file.type, success);
	};
	reader.readAsArrayBuffer(file);
    };

    self.uploadData = function(data, type, success) {
        const xhr = new XMLHttpRequest();

        type = type || 'application/octet-stream';

        xhr.upload.addEventListener("progress", function(e) {
            if (e.lengthComputable) {
                const percentage = Math.round((e.loaded * 100) / e.total);
                app.echo("upload:"+ percentage + "%," + e.loaded + "/" + e.total);
            }
        }, false);

        xhr.upload.addEventListener("load", function(e){
            app.echo("uploaded as " + type);
        }, false);

        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                var data = JSON.parse(xhr.responseText);
		success(data.path);
            } else {
                app.echo("error upload");
            }
        };

        xhr.onerror = function(e) {
            app.err("error upload: connection?");
        };
        
        xhr.open("POST", "/api/files/upload");
        xhr.setRequestHeader('Content-Type', type);
        xhr.send(data);
    };

}

if (!HTMLCanvasElement.prototype.toBlob) {
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    value: function (callback, type, quality) {
      var dataURL = this.toDataURL(type, quality).split(',')[1];
      setTimeout(function() {

        var binStr = atob( dataURL ),
            len = binStr.length,
            arr = new Uint8Array(len);

        for (var i = 0; i < len; i++ ) {
          arr[i] = binStr.charCodeAt(i);
        }

        callback( new Blob( [arr], {type: type || 'image/png'} ) );

      });
    }
  });
}

/***********************************************************************
 *
 * filechooser -- picking files from local file system
 *
 *  viewer params
 *   - accept: what kinds of file to choose from file system.
 *              possible values: 'image/*',  'video/*;capture=camcorder'
 *
 **********************************************************************/
registerViewer('filechooser', {
    load: function() {
	var v = this;

        const vc = cloneTemplate("tpl-file-chooser");
	var fc = new FileChooser(v, v.data.accept);
	var selectedFile = null;
	var btnUpload = vc.find('#upload');

        btnUpload.onclick = function() {
	    if (v.data.maxImageSize) {
		var image = vc.find('#preview').lastChild;
		var canvas = document.createElement('canvas'),
		    max_size = v.data.maxImageSize,
		    width = image.width,
		    height = image.height;
		if (width > height) {
		    if (width > max_size) {
			height *= max_size / width;
			width = max_size;
		    }
		} else {
		    if (height > max_size) {
			width *= max_size / height;
			height = max_size;
		    }
		}
		canvas.width = width;
		canvas.height = height;
		canvas.getContext('2d').drawImage(image, 0, 0, width, height);
		canvas.toBlob(function(b) {
		    fc.uploadData(b, b.type, function(x) {
			v.dispatch('did-upload', x);
			v.close();
		    });
		});
	    } else {
		fc.uploadFile(selectedFile, function(x) {
		    v.dispatch('did-upload', x, selectedFile);
		    v.close();
		});
	    }
        };

        btnUpload.disabled = true;

	v.showFileChooser = function () {
	    console.log("showFileChooser");
	    fc.open(function(file) {
		selectedFile = file;
                btnUpload.disabled = false;
		console.log("file:", file);
                vc.find('#preview').empty();
                vc.find('#fileinfo').show();
                vc.find('#name').textContent = file.name;
                vc.find('#size').textContent = humanFileSize(file.size);
                vc.find('#type').textContent = file.type;
		if (file.type && file.type.startsWith('image/')) {
		    fc.readAsImage(file, function(image) {
			vc.find('#preview').appendChild(image);
		    });
		}
	    });
	}

	var btnOpen = v.toolbar.addButton("open", function() {
	    v.showFileChooser();
	});

	return vc;
    },

    loaded: function() {
        var v = this;
        v.showFileChooser();
    }

});
