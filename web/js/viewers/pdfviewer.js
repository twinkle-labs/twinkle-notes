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

var pdfjsLib = null;

registerViewer('pdfviewer', {
    embed: function(note,name,path,page) {
        if (!page) {
            page = 1;
        }
        var el = document.createElement('a');
        el.innerHTML = '<i class="fa fa-file-pdf"></i> <i id="name"></i> <small id="page"></small>';
        el.href='#';

        if (name) {
            el.find('#name').textContent = name;
            if (page > 1) {
                el.find('#page').textContent = "p. " + page;
            }
        } else {
            el.find('#page').textContent = "p. " + page;
        }
        if (note && note.viewer)
            el.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                note.viewer.space.openViewer({
                    type: 'pdfviewer',
                    path: path,
                    name: name,
                    page: parseInt(page)
                }, note.viewer);
            };
        return el;
    },
    load: function() {
        var v = this;
        var el = document.createElement('div');
        el.className = 'pdfviewer';
        var canvas = document.createElement('canvas');
        el.appendChild(canvas);
        var pdfDoc = null;
        var pageNumber = v.data.page ? parseInt(v.data.page) : 1;
        var numPages = 0;
        var zoomLevel = 3;
        var zoomScales = [0.5,0.75,1,1.5,2];
        var btnPrev = v.toolbar.addIconButton("angle-left", function() {
            if (pageNumber > 1)
                pageNumber--;
            renderCurrentPage();
        });

        var btnNext = v.toolbar.addIconButton("angle-right", function() {
            if (pageNumber < numPages)
                pageNumber++;
            renderCurrentPage();
        });

        var input = v.toolbar.addInput();
        input.type = 'text';
        input.style.width = '60px';
        var btnGo = v.toolbar.addButton("Go", function() {
            var i = parseInt(input.value);
            if (i) {
                pageNumber = i;
                renderCurrentPage();
            }
        });

        v.toolbar.addIconButton("search-plus", function() {
            if (zoomLevel < zoomScales.length) {
                zoomLevel++;
                renderCurrentPage();
            }
        });
        v.toolbar.addIconButton("search-minus", function() {
            if (zoomLevel > 1) {
                zoomLevel--;
                renderCurrentPage();
            }
        });
        v.toolbar.addIconButton("copy", function() {
            var s = "[pdf:" + (v.data.name || '') + "," + v.data.path + "," + pageNumber + "]";
            copyToClipboard(s);
            app.echo('Copied: ' + s);
        });

        btnNext.disabled = true;
        btnPrev.disabled = true;
        btnGo.disabled = true;
        
        function renderCurrentPage() {
            if (pdfDoc == null)
                return;
            if (pageNumber > numPages)
                pageNumber = numPages;
            else if (pageNumber < 1)
                pageNumber = 1;
            input.value = pageNumber;
            v.setTitle((v.data.name||'') + " " + pageNumber + "/" + numPages);
            pdfDoc.getPage(pageNumber).then(function(page) {
                var dpr = window.devicePixelRatio || 1;
                var scale = zoomScales[zoomLevel-1]*dpr;
                var viewport = page.getViewport(scale);
                // Prepare canvas using PDF page dimensions
                var context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                canvas.style.width = viewport.width/dpr+'px';
                canvas.style.height = viewport.height/dpr+'px';
                //context.scale(dpr,dpr);
                // Render PDF page into canvas context
                var renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                var renderTask = page.render(renderContext);
                renderTask.promise.then(function () {
                    console.log('Page rendered');
                });
            });
        }

        function loadPDF(url) {
            // Asynchronous download of PDF
            var loadingTask = pdfjsLib.getDocument(url);
            loadingTask.promise.then(function(pdf) {
                pdfDoc = pdf;
                numPages = pdf.numPages;
                renderCurrentPage();
                btnPrev.disabled = false;
                btnNext.disabled = false;
                btnGo.disabled = false;
            }, function (reason) {
                // PDF loading error
                console.error(reason);
            });            
        }

        if (!pdfjsLib) {
            dynload([
                "/lib/pdfjs/2.0.943/pdf.min.js"
            ], function() {
                var url = v.data.path;
                // Loaded via <script> tag, create shortcut to access PDF.js exports.
                pdfjsLib = window['pdfjs-dist/build/pdf'];
                // The workerSrc property shall be specified.
                pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdfjs/2.0.943/pdf.worker.min.js';
                loadPDF(v.data.path);
            });
        } else {
            loadPDF(v.data.path);
        }
        return el;
    }

});

registerViewer('pdf', 'pdfviewer');
