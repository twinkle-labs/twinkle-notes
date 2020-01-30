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


var recorder = null;
var chunks = [];            
var recording = false;

function recordVoice()
{
    if (recording)
        return;
    
    navigator.mediaDevices.getUserMedia({
        audio: true
    }).then(function (stream) {
        if (!recorder) {
            recorder = new MediaRecorder(stream);
            recorder.addEventListener('dataavailable',function(e) {
                console.log("data:", e.data.size);
                chunks.push(e.data);
            });
        }
        if (recorder && !recording) {
            recording = true;
            recorder.start();
            // recorder.start(1000);
            console.log("recording...");
        }
    }).catch(function (e) {
        alert('No live audio input: ' + e);
    });
}


function stopVoiceRecording(cb) {
    if (!recorder || !recording)
        return;

    recorder.addEventListener('stop', function(e) {
        var f = new File(chunks, "voice", {
            'type' : (recorder.mimeType ? recorder.mimeType : 'audio')
        });
        console.log("data available after MediaRecorder.stop() called:", recorder.mimeType, f.size);
        cb(f);
        recording = false;
        chunks = [];
        recorder = null;
    });
    recorder.stop();
    recorder.stream.getTracks().forEach(function(track) {
        track.stop();
    });
}


