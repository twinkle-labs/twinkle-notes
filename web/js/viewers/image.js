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

function ImageView(v, container, url)
{
    var self = this;
    self.container = container;

    // The default display size may not equal to actual image size
    // Offset and scaling applies to the display rather than image
    var imgDisplayDefaultWidth;
    var imgDisplayDefaultHeight;
    var imgDisplayOffsetX;
    var imgDisplayOffsetY;
    var imgDisplayScale = 1.0;
    var imgDisplayScaleMin = 0.5;
    var imgDisplayScaleMax; // determined by actual image size
    var imgWidth;
    var imgHeight;
    var containerWidth;
    var containerHeight;
    
    var img = new Image();
    self.image = img;
    img.src = url;
    img.onload = function() {
        imgWidth = img.width;
        imgHeight = img.height;
        container.empty();
        container.appendChild(img);
        if (img.width) {
            img.addEventListener('mousedown', function(e){
                e.preventDefault();
                return false;
            });
            container.addEventListener('wheel', function(e) {
                // So that page does not bounce.
                // and safari will continue to fire wheel events
                e.preventDefault();

                // Firefox doesn't have wheelDelta
                scaleAt(e.clientX, e.clientY, 1 + (e.wheelDelta || e.deltaY) / 200);
            }, false);
            onDisplayChange();
            initGesture();
        }
    };

    self.scale = function(x) {
        redisplay(0, 0, x, true);
    };

    // We want to keep the pointed position at the same client
    // position (relative to viewport).
    function scaleAt(clientX, clientY, scale) {
        var imgRect = img.getBoundingClientRect();
        var x = clientX - imgRect.left;
        var y = clientY - imgRect.top;
        var px = x/imgRect.width;
        var py = y/imgRect.height;

        redisplay(0, 0, scale, true);

        imgRect = img.getBoundingClientRect();
        var clientX2 = imgRect.left + imgRect.width * px;
        var clientY2 = imgRect.top + imgRect.height * py;
        redisplay(clientX-clientX2, clientY-clientY2, 1, true);
    }

    function onDisplayChange() {
        containerWidth = container.offsetWidth;
        containerHeight = container.offsetHeight;
        imgDisplayDefaultWidth = img.offsetWidth;
        imgDisplayDefaultHeight = img.offsetHeight;
        imgDisplayOffsetX = 0;
        imgDisplayOffsetY = 0;
        imgDisplayScale = 1.0;
        imgDisplayScaleMin = 0.5;
        imgDisplayScaleMax = Math.max(2.0, imgWidth * 2 / imgDisplayDefaultWidth);
    }
    
    // Will commit to imgDisplayOffset/Scale at the end of gesture
    var redisplayParams = null;

    // Transform current image display.
    // If shouldCommit is true, then imageDisplayOffset|Scale will be remembered.
    // Inside gesture handler -- pan & pinch -- redisplay is temporary
    // we only commit when the gesture is done
    function redisplay(offsetX, offsetY, scale, shouldCommit) {
        //console.log("redisplay", offsetX, offsetY, scale);
        scale = clamp(imgDisplayScale*scale,
                      imgDisplayScaleMin,
                      imgDisplayScaleMax);

        var w = imgDisplayDefaultWidth * scale;
        var h = imgDisplayDefaultHeight * scale;

        var imgDisplayOffsetXMin;
        var imgDisplayOffsetXMax;
        var imgDisplayOffsetYMin;
        var imgDisplayOffsetYMax;
        
        if (containerWidth < w) {
            imgDisplayOffsetXMin = (containerWidth - w) / 2;
            imgDisplayOffsetXMax = -(containerWidth - w) / 2;
        } else {
            imgDisplayOffsetXMin = 0;
            imgDisplayOffsetXMax = 0;
        }
        if (containerHeight < h) {
            imgDisplayOffsetYMin = (containerHeight - h) / 2;
            imgDisplayOffsetYMax = -(containerHeight - h) / 2;
        } else {
            imgDisplayOffsetYMin = 0;
            imgDisplayOffsetYMax = 0;
        }
        
        var x = clamp(imgDisplayOffsetX+offsetX,
                              imgDisplayOffsetXMin,
                              imgDisplayOffsetXMax);
        var y = clamp(imgDisplayOffsetY+offsetY,
                              imgDisplayOffsetYMin,
                              imgDisplayOffsetYMax);

        //console.log("transform: ", x, y, scale);
        if (shouldCommit) {
            redisplayParams = null;
            imgDisplayOffsetX = x;
            imgDisplayOffsetY = y;
            imgDisplayScale = scale;
        } else {
            redisplayParams = {
                offsetX: x,
                offsetY: y,
                scale: scale
            };
        }
        const transform =
              'translateX(' + x + 'px) ' +
              'translateY(' + y + 'px) ' +
              'translateZ(0px) ' +
              'scale(' + scale + ',' + scale + ')';

        img.style.transform = transform;
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(min, value), max);
    }

    function initGesture() {
        const hammertime = new Hammer(container);

        hammertime.get('pinch').set({ enable: true });
        hammertime.get('pan').set({ direction: Hammer.DIRECTION_ALL });
        hammertime.get('doubletap').set({
            threshold: 5,
            posThreshold: 15
        });
        hammertime.on('pan', function(e) {
           // console.log("pan", e.deltaX, e.deltaY);
            redisplay(e.deltaX, e.deltaY, 1.0);
        });

        hammertime.on('doubletap', function(e) {
            if (imgDisplayScale == 1.0) {
                scaleAt(e.center.x, e.center.y, imgWidth/imgDisplayDefaultWidth);
            } else {
                onDisplayChange();
                redisplay(0, 0, 1.0, true);
            }
        });

        hammertime.on('pinch pinchmove', function(e){
            //console.log("pinch", e.deltaX, e.deltaY, e.scale);
            redisplay(e.deltaX, e.deltaY, e.scale);
        });

        hammertime.on('panend pancancel pinchend pinchcancel', function() {
            if (redisplayParams) {
                imgDisplayOffsetX = redisplayParams.offsetX;
                imgDisplayOffsetY = redisplayParams.offsetY;
                imgDisplayScale = redisplayParams.scale;
                redisplayParams = null;
            }
        });
    }
}

registerViewer('image', {
    name: "ImageViewer",
    load: function () {
        const v = this;
        var vc = cloneTemplate('tpl-image-viewer');
        
        var imageContainer = vc.find('.image-container');
        var imageView = new ImageView(v, imageContainer, v.data.url);

        v.toolbar.addIconButton('search-plus', function() {
            imageView.scale(1.2);
        });
        v.toolbar.addIconButton('search-minus', function() {
            imageView.scale(0.8);
        });
        v.toolbar.addIconButton('copy', function() {
            var dlg = cloneTemplate('tpl-image-viewer-copy-dlg');
            dlg.find('#copy-ref').onclick = function() {
                copyToClipboard('[image:'+v.data.url+']');
                v.dismissModal();
            };
            dlg.find('#cancel').onclick = function() {
                v.dismissModal();
            };
            v.showModal(dlg);
        });

        return vc;
    }
});

