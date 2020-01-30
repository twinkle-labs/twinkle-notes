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

Node.prototype.empty = function() {
    while (this.lastChild)
        this.removeChild(this.lastChild);
    return this;
};

Node.prototype.removeFromParent = function() {
    if (this.parentNode)
	this.parentNode.removeChild(this);
    return this;
};

Node.prototype.find = function(selector) {
    return this.querySelector(selector);
};

Node.prototype.show = function(sel) {
    if (sel) {
        this.find(sel).classList.remove('collapse');
    } else {
        this.classList.remove('collapse');
    }
};

// Exclusively
Node.prototype.showx = function() {
    var a = this.parentNode.children;
    for (var i = 0; i < a.length; i++) {
        if (a[i] == this)
            this.classList.remove('collapse');
        else
            a[i].classList.add('collapse');
    }
};

Node.prototype.hideAll = function() {
    var a = this.children;
    for (var i = 0; i < a.length; i++)
        a[i].classList.add('collapse');
};

Node.prototype.hide = function(sel) {
    if (sel) {
        this.find(sel).classList.add('collapse');
    } else {
        this.classList.add('collapse');
    }
};

if (window.NodeList && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = function (callback, thisArg) {
        thisArg = thisArg || window;
        for (var i = 0; i < this.length; i++) {
            callback.call(thisArg, this[i], i, this);
        }
    };
}

if (!String.prototype.endsWith) {
    String.prototype.endsWith=function(x,l) {
        if (l === undefined ||l > this.length)
            l = this.length;
        return this.substring(l-x.length, l) === x;
    };
}

String.prototype.splice = function(index, count, add) {
    var str = this;
  // We cannot pass negative indexes directly to the 2nd slicing operation.
  if (index < 0) {
    index = str.length + index;
    if (index < 0) {
      index = 0;
    }
  }
  return str.slice(0, index) + (add || "") + str.slice(index + count);
};

String.prototype.countBytes = function() {
    return new Blob([this]).size;
};

String.prototype.getShortId = function() {
    return '@'+this.substring(0,6);
};

function getHashParameters() {
    var d = {};
    window.location.hash.substr(1).split("&").forEach(function(item) {
	var s = item.split("=");
	var k = s[0];
	var v = s[1] && decodeURIComponent(s[1]);
	d[k] = v;
    });
    return d;
}

function removeCookie(name) {
  document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

function createTextSpan(s)
{
    var span = document.createElement('span');
    span.textContent = s;
    return span;
}

function createParagraph(s)
{
    var p = document.createElement('p');
    p.textContent = s;
    return p;
}

function uploadData(viewer, data, success)
{
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
        if (xhr.status >= 200 && xhr.status < 300) {
            var data = JSON.parse(xhr.responseText);
	    success(data.path);
        } else {
            app.echo("error upload");
        }
    };

    xhr.onerror = function(e) {
        app.echo("error upload: connection?");
    };
    
    xhr.open("POST", "/api/files/upload");
    if (data.type) {
        xhr.setRequestHeader('Content-Type', data.type);
    }
    xhr.send(data);
}

// https://hackernoon.com/copying-text-to-clipboard-with-javascript-df4d4988697f
function copyToClipboard(str)
{
  const el = document.createElement('textarea');  // Create a <textarea> element
  el.value = str;                                 // Set its value to the string that you want copied
  el.setAttribute('readonly', '');                // Make it readonly to be tamper-proof
  el.style.position = 'absolute';                 
  el.style.left = '-9999px';                      // Move outside the screen to make it invisible
  document.body.appendChild(el);                  // Append the <textarea> element to the HTML document
  const selected =            
    document.getSelection().rangeCount > 0        // Check if there is any content selected previously
      ? document.getSelection().getRangeAt(0)     // Store selection if found
      : false;                                    // Mark as false to know no selection existed before
  el.select();                                    // Select the <textarea> content
  document.execCommand('copy');                   // Copy - only works as a result of a user action (e.g. click events)
  document.body.removeChild(el);                  // Remove the <textarea> element
  if (selected) {                                 // If a selection existed before copying
    document.getSelection().removeAllRanges();    // Unselect everything on the HTML document
    document.getSelection().addRange(selected);   // Restore the original selection
  }
}

// Return an integer of seconds since unix epoch
function unixtime()
{
    return Math.floor(Date.now() / 1000);
}

function enterFullscreen(contentElement)
{
    if (contentElement) {
        if (contentElement.webkitRequestFullscreen)
            contentElement.webkitRequestFullscreen();
        else if (contentElement.mozRequestFullScreen)
            contentElement.mozRequestFullScreen();
        else if (contentElement.msRequestFullscreen)
            contentElement.msRequestFullscreen();
    }
}

function exitFullscreen()
{
    if (document.exitFullscreen) {
	document.exitFullscreen();
    } else if (document.mozCancelFullScreen) {
	document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
	document.webkitExitFullscreen();
    }
}

function createButton(title, onclick, options)
{
    var el = document.createElement("button");
    el.onclick = onclick;
    el.className = "btn";
    if (options) {
	if (options.icon) {
	    var i = document.createElement("i");
	    i.className = "fa fa-" + options.icon;
	    i.setAttribute('aria-hidden', true);
	    el.appendChild(i);
	    el.appendChild(document.createTextNode(' '));    
	}
	if (options.title) {
	    el.setAttribute('title', options.title);
	}
    }
    el.appendChild(document.createTextNode(title));    
    return el;
}


// text: optional, along side with icon
// title: optional, displayed when hover
function createIconButton(name, onclick, text, title)
{
    var el = document.createElement("button");
    el.className = "btn";
    el.onclick = onclick;
    var i = document.createElement("i");

    i.className = "fa fa-" + name;

    i.setAttribute('aria-hidden', true);
    el.appendChild(i);
    if (text) {
	var t = document.createTextNode(" " + text);
	el.appendChild(t);
    }
    if (title) {
	el.setAttribute('title', title);
    }
    return el;
}

function humanFileSize(size) {
    if (size < 1000) {
        return size + 'B';
    } else if (size < 1000*1000) {
        return (size / 1000).toFixed(2) + 'KB';
    } else {
        return (size / 1000 /1000).toFixed(2) + 'MB';
    }
}

function createSelect(options) {
    var el = document.createElement('select');
    options.forEach(function(o){
        var option = document.createElement('option');
        option.value = o.value;
        option.textContent = o.title;
        el.appendChild(option);
    });
    return el;
}

function createLabel(text) {
    var el = document.createElement('label');
    el.textContent = text;
    return el;
}

//https://stackoverflow.com/questions/494143/creating-a-new-dom-element-from-an-html-string-using-built-in-dom-methods-or-pro
function createElementFromHTML(html) {
    var template = document.createElement('template');
    html = html.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
    return template.content.firstChild;
}

function createSpinner() {
    return createElementFromHTML('<i class="fa fa-spinner fa-spin" style="font-size:24px"></i>');
}


function encodeQueryParams(object) {
    var encodedString = '';
    for (var prop in object) {
        if (object.hasOwnProperty(prop)) {
            if (encodedString.length > 0) {
                encodedString += '&';
            }
            encodedString += (prop) + '=' + encodeURIComponent(object[prop]);
        }
    }
    return encodedString;
}

function httpGet(url, params, success, fail) {
    var xhr = new XMLHttpRequest();
    if (params) {
	var s = encodeQueryParams(params);
	if (url.indexOf('?') >= 0)
	    url = url + '&' + s;
	else
	    url = url + '?' + s;
    }
    xhr.open('GET', url);
    xhr.onload = function() {
	if (xhr.status === 200) {
	    success(xhr.responseText);
	}
	else {
	    fail({error: xhr.responseText?xhr.responseText:"Bad Request"});
	}
    };
    xhr.onerror = function() {
	    fail({error: xhr.responseText?xhr.responseText:"Bad Request"});
    };
    xhr.send();
}


function httpGetJSON(url, params, success, fail) {
    httpGet(url,params,function(x){
	var o = JSON.parse(x);
	if (o) {
	    success(o);
	} else {
	    fail({error: "Invalid JSON"});
	}
    }, fail);
}


function httpGetSEXP(url, params, success, fail) {
    httpGet(url,params,function(x){
	var o = SEXP.parse(x);
	if (o && o.data) {
	    success(o.data);	
	} else {
	    fail({error: "Invalid SEXP"});
	}
    }, fail);
}

function loadUrlResource(url, callback) {
    httpGet(url,{},callback,function(err){
	throw err;
    });
}

function loadJS(path, success, error) {
    var script = document.createElement('script');
    script.setAttribute('src', path);
    script.onload = function() {
        success(script);
    };
    script.onerror = function() {
        error();
    }
    document.getElementsByTagName('head')[0].appendChild(script);
}

function loadCSS(path, success, error) {
    return new Promise(function(resolve, reject) {
	var link = document.createElement("link");
	link.rel = "stylesheet";
	link.type = "text/css";
	link.href = path;
	link.onload = function () {
            resolve();
	};
	link.onerror = function (err) {
            reject(err);
	};
	document.getElementsByTagName('head')[0].appendChild(link);
    });
}


function getCookie(cname) {
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(';');
  for(var i = 0; i <ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}



function generateUUID(len, radix) {
    var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
    var uuid = [], i;
    radix = radix || chars.length;

    if (len) {
        // Compact form
        for (i = 0; i < len; i++)
            uuid[i] = chars[0 | Math.random() * radix];
    } else {
        // rfc4122, version 4 form
        var r;

        // rfc4122 requires these characters
        uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-';
        uuid[14] = '4';

        // Fill in random data.  At i==19 set the high bits of clock sequence as
        // per rfc4122, sec. 4.1.5
        for (i = 0; i < 36; i++) {
            if (!uuid[i]) {
                r = 0 | Math.random() * 16;
                uuid[i] = chars[(i == 19) ? (r & 0x3) | 0x8 : r];
            }
        }
    }
    return uuid.join('');
}

function getDisplayAvatar(u) {
    return u.photo || '/img/default-avatar.jpg';
}
