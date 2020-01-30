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

window.dynload = (function() {
    function loadJS(path, success, error) {
        var script = document.createElement('script');
        script.setAttribute('src', path);
        script.onload = function() {
            success();
        };
        script.onerror = function() {
            error('js:'+path);
        }
        document.getElementsByTagName('head')[0].appendChild(script);
    }

    function loadCSS(path, success, error) {
        // If this css file already included in head,
        // we should remove it first to avoid spamming.
        document.querySelectorAll('link').forEach(function(x){
            if (x.getAttribute('href')==path) {
                x.parentNode.removeChild(x);
            }
        });

        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = path;
        link.onload = function () {
            success();
        };
        link.onerror = function () {
            error('css:'+path);
        };
        document.getElementsByTagName('head')[0].appendChild(link);
    }

    function loadFiles(tasks, success, error) {
        var n = tasks.length;
        if (n <= 0)
            return success();
        function didTask(err) {
            if (n > 0) {
                if (!err) {
                    if (--n == 0)
                        success();
                } else {
                    error('dynload error:'+err);
                    n = 0;
                }
            }
        }
        tasks.forEach(function(t) {
            var p = t.url;
            if (p.endsWith(".js")) {
                loadJS(p, didTask, didTask);
            } else if (p.endsWith(".css")) {
                loadCSS(p, didTask, didTask);
            } else {
                httpGet(p,{},function(x) {
                    if (t.got) {
                        t.got(x);
                    }
                    didTask();
                }, didTask);
            }
        });
    }
    
    function dynload(paths, success, error) {
        loadFiles(paths.map(function(x){
            return typeof x == 'string' ? {url:x} : x;
        }), success, error);
    }

    return dynload;
})();
