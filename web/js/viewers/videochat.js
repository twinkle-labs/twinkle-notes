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

/*
   videochat viewer

accept configuration parameters:
 - mux
 - audio: boolean, true if audio only
 - 
 
*/


registerViewer('videochat', {
    name: "VideoChat",
    load: function() {
	var v = this;
	var mux = v.space.mux;
	var busy = false;
	var peerConnection = null;
        var channel = v.data.channel;

        if (!channel || channel.length==0)
            throw new Error("videochat: channel required");
        
        // We use session to identify end points.
        // remember that one user can have many devices online
        // and one device may have many viewers open
        // therefore relying on user id is inadequate.
	var remoteSession = null;
        var remoteUser = null;
        var localSession =  generateUUID(8);
        var localStream = null;        
	var configuration = {iceServers: [
	    {
		url: 'turn:<ip>:3478?transport=udp',
		username: 'test',
		credential: 'test',
	    },
	    {url:'stun:stun01.sipphone.com'},
	]};

	v.setTitle('videochat');
	
        var elContent = document.createElement("div");
        var video = document.createElement("video");
        video.setAttribute('muted', true);
        video.setAttribute('autoplay', true);
        video.innerHTML = "Video not supported";
	video.className = 'local-video';

        var remote_video = document.createElement("video");
	remote_video.className='remote-video';
        remote_video.setAttribute('muted', false);
        remote_video.setAttribute('autoplay', true);
        remote_video.innerHTML = "Video not supported";

	elContent.className = 'videochat';
        elContent.appendChild(remote_video);
	elContent.appendChild(video);

	
	v.hangup = function() {
	    remoteSession = null;
            if (localStream) {
                localStream.getTracks().forEach(function(track) {
                    track.stop()
                });
                localStream = null;
            }
            if (peerConnection && peerConnection.close)
                peerConnection.close();
            peerConnection = null;
	};

        var ice_candidates = [];


        function sendCandidates() {
            if (remoteSession && ice_candidates.length > 0) {
                console.log("sending candidate to peer " + remoteUser + "/"
                            + remoteSession);
	        mux.notify(channel, remoteUser, [
                    'new-ice-candidate',
                    remoteSession,
                    JSON.stringify(ice_candidates[0])
                ]);
            }
        }

        // Receiving ICE candidate from peerConnection
	function onICECandidate(e) {
	    console.log("add ice candidate from browser:", e.candidate);
            if (e.candidate) {
                ice_candidates.push(e.candidate);
                sendCandidates();
            }
	}

	function startLocalVideo(enableVideo, did) {
            navigator.mediaDevices.getUserMedia(
		{video: enableVideo, audio: true}
	    ).then(function(_localStream) {
                localStream = _localStream;
		if (enableVideo) {
                    // Important!!! whistle
                    video.muted = true;
                    video.srcObject = localStream;
		}
                localStream.getTracks().forEach(function(track) {
                    //if (track.kind == 'video')
                    //    track.enabled = false;
		    peerConnection.addTrack(track, localStream);
                });
		did();
            }).catch(function(e) {
		alert("can not start local video");
	    });
	}
	
        function onClose() {
            v.setTitle("Closed");
        }

	function startCall() {
	    if (peerConnection != null)
		return;

	    peerConnection = new RTCPeerConnection(configuration);

	    peerConnection.addEventListener('track', onRemoteTrack);
	    peerConnection.addEventListener('icecandidate', onICECandidate);
	    peerConnection.addEventListener('close', onClose);

	    startLocalVideo(true, function(){
		peerConnection.createOffer()
		    .then(function(offer) {
			return peerConnection.setLocalDescription(offer);
		    })
		    .then(function() {
                        console.log("sending video-offer to " + remoteUser);
			mux.notify(channel, remoteUser, [
                            'video-offer',
                            localSession,
			    JSON.stringify(peerConnection.localDescription)
                        ]);
		    })
		    .catch(function(e) {
                        console.log("can not create offer:", e);
		    });
	    });	    
	}

        // type: 'video' or 'audio'
        function enableTrack(type, value) {
            if (!peerConnection)
                return;
            peerConnection.getSenders().forEach(function(sender) {
                if (sender.track.kind == type) {
                    sender.track.enabled = value;
                }
            });
        }
        
	function onRemoteTrack(e) {
	    remote_video.srcObject = e.streams[0];
	}

	function answerCall(sdp) {
	    if (peerConnection != null) {
		console.log("on video-offer: already busy");
		return;
	    }
            console.log("answerCall:", remoteUser);
	    peerConnection = new RTCPeerConnection(configuration);
	    peerConnection.setRemoteDescription(JSON.parse(sdp));
	    peerConnection.addEventListener('icecandidate', onICECandidate);
	    peerConnection.addEventListener('track', onRemoteTrack);
	    peerConnection.addEventListener('close', onClose);
            
	    startLocalVideo(true, function(){
		peerConnection.createAnswer()
		    .then(function(answer) {
			return peerConnection.setLocalDescription(answer);
		    })
		    .then(function(){
			mux.notify(channel, remoteUser, [
                            'video-answer',
                            remoteSession,
                            localSession,
			    JSON.stringify(peerConnection.localDescription)
                        ]);
		    })
		    .catch(function(e){
			alert("bad happen in answer");
		    });
	    });
	}

        mux.on(v.data.channel, v, function(from, method) {
            if (from != remoteUser)
                return;
            
            switch (method) {
            case 'new-ice-candidate':
                var session = arguments[2];
                var candidate = arguments[3];
	        if (session == localSession && peerConnection != null)
	        {
		    var cand = JSON.parse(candidate);
		    console.log("add ice candidate from peer " + remoteUser + "/" + remoteSession);
		    peerConnection.addIceCandidate(cand);
	        } else {
                    console.log("discard ice candidate");
                }
                break;
            case 'video-answer':
                var session = arguments[2];
                remoteSession = arguments[3];
                var sdp = arguments[4];

                if (session != localSession) {
                    console.log("session mismatch",session,localSession);
                    break;
                }
	        console.log("got answer:", remoteUser, sdp);
	        if (peerConnection == null)
                {
                    console.log("bad connection");
                    return;
                }
                v.setTitle("Active");
                sendCandidates();
	        peerConnection.setRemoteDescription(JSON.parse(sdp));
                break;
            default:
                break;
            }
        });
        
        if (v.data.to) {
            v.setTitle("Calling " + v.data.to.name);
            remoteUser = v.data.to.uuid;
            startCall();
        } else if (v.data.from) {
            remoteUser = v.data.from.uuid;
            remoteSession = v.data.from.session;
            mux.getUserInfo(v.data.from.uuid, function(info) {
                v.setTitle("Incoming call " + info.name);
            });
            var btnAnswer = v.toolbar.addButton("answer", function(e) {
                answerCall(v.data.from.sdp);
                btnAnswer.disabled = true;
            });
        }
        

        
        var btnVideo = v.toolbar.addButton("video off", function(e) {
            if (btnVideo.classList.contains('active')) {
                btnVideo.classList.remove('active');
                enableTrack('video', true);
            } else {
                btnVideo.classList.add('active');
                enableTrack('video', false);
            }
        });
        
        var btnMute = v.toolbar.addButton("mute", function(e) {
            if (btnMute.classList.contains('active')) {
                btnMute.classList.remove('active');
                enableTrack('audio', true);
            } else {
                btnMute.classList.add('active');
                enableTrack('audio', false);
            }
        });

        v.toolbar.addButton("end", function(e) {
            v.hangup();
            v.close();
        });
        
	return elContent;
    },

    unload: function() {
        var v = this;
        v.space.mux.off(v.data.channel, v);
        v.hangup();
    }

});
