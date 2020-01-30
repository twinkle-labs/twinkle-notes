;;    
;; Copyright (C) 2020, Twinkle Labs, LLC.
;;
;; This program is free software: you can redistribute it and/or modify
;; it under the terms of the GNU Affero General Public License as published
;; by the Free Software Foundation, either version 3 of the License, or
;; (at your option) any later version.
;;
;; This program is distributed in the hope that it will be useful,
;; but WITHOUT ANY WARRANTY; without even the implied warranty of
;; MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
;; GNU Affero General Public License for more details.
;;
;; You should have received a copy of the GNU Affero General Public License
;; along with this program.  If not, see <https://www.gnu.org/licenses/>.
;;

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; blob-sync.l -- Syncing blob storage
;;
;; Implements the syncing client. The dbpath and dbkey must be provided
;; in ARGS so that this process access open the space db.
;;
;; Upon connection ready, our identity is already established during
;; connection negotiation. Still, we need to send a hello message to authorization check,
;; and to indicate which instance we are syncing from, because one id can reside in
;; different devices.
;; And we also need to check that our shared secret is still compatible with the host.
;; We must never hand over the shared secret to host, but just a hash for checking.
;;
;; Process should send status update to its parent.
;; - Syncing actively. How many blobs remained to pull and how many to push
;; - Idle. Update to date. waiting for work. How many blobs are synced.
;;   use the remote position. and last time we have synced successfully.
;; - Error. The server rejects our authorization, or terminate connection.
;;
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define ss)

(define auth false)
(define remote-pos) ;; synced position from server
(define max-remote-pos 0) ;; syncable position from server
(define pushable-pos 0)   ;; server doesn't have our blobs later than this
(define server-instance-id) ;; For tracking server synced position
(define pullable ()) ;; pullable xblobs from server
(define pushable ()) ;; local pushable xblobs
(define asking false)
(define last-ask-time 0)
(define shared-secret)
(define quit-on-idle false)
(define current-user false)
(define last-report-time 0)

;; Sync Status
;; - Syncing: working
;; - Synced: idling
(define working true)
(define pulled 0)
(define pushed 0)
(define last-synced 0)

(define (notify &rest x)
  (println "notify parent: " x)
  (send-message (get-parent-pid) x))

(define (report-progress &optional force)
  (if (or force (> (- (time) last-report-time) 1))
      (begin
	(notify 'on-space-sync
		'progress
		(make-sync-status))
	(set! last-report-time (time)))))

(define (set-working)
  (if (not working)
      (begin
	(set! pulled 0)
	(set! pushed 0)
	(set! working true)
	(report-progress true)
	)))

(define (set-idle)
  (when (not working)
	(if (= last-report-time 0)
	    (report-progress true))
	(return))
  (println "Idle: pulled=" pulled " pushed=" pushed " remote=" remote-pos)
  (if (> pulled 0)
      (notify 'on-space-sync 'updated))
  (ss 'set-config "server-\{server-instance-id}:last-synced" (time))  
  (set! working false)
  (set! last-synced (time))
  (report-progress true)
  )

(define (make-sync-status)
  (list
   :working working
   :pulled pulled
   :pushed pushed
   :lastSynced last-synced
   :pos remote-pos
   :maxPos max-remote-pos))

(define (send-ask)
  (set! asking true)
  (set! last-ask-time (time))
  (post-message 'ask remote-pos (ss 'max-xblob-id)))

(define (find-pushable)
  (if (null? pushable)
      (set! pushable (ss 'list-pushable-xblobs pushable-pos
			 server-instance-id)))
  pushable)

(define (save-remote-pos)
  (ss 'save-instance-pos remote-pos server-instance-id))

(define (send-device-info)
  (define token (ss 'get-config 'device-token))
  (if token
      (post-message 'update-device-info
                    (ss 'get-config 'device-type)
                    token)))

(defmethod (dispatch-message x)
  (match x
	 [(welcome instance-id)
	  (ss 'register-instance server-uuid instance-id (time))
	  (define i (ss 'get-instance server-uuid instance-id))
	  (set! server-instance-id i:id)
	  (set! remote-pos i:pos)
	  (println "Load remote pos:" remote-pos)
	  (set! auth true)
          (send-device-info)
	  (send-ask)]

	 [(bye &optional err) ;; Remote side decide to hang up
	  (if err
              (error "Sync" (cdr err)))
          (exit)
          false
	  ]

	 [(keep-alive)] ;; should use ask instead?

	 [(did-ask pos maxpos lastpos u)
	  ;; pos -- should match what we sent
	  ;;    Put pos first makes log reading better
	  ;; maxpos -- The maximum position on the host
	  ;;    If our recorded host position is less than
	  ;;    that, it means we should try to pull things
	  ;;    which is provided in <u>
	  ;; lastpos -- The position in our blob stream
	  ;;    up to which the host has learned of.
	  ;;    We should try to push things after it to
	  ;;    the host. However, pull first.
	  ;; u -- The new blobs after <pos> that we may want
	  ;;    to pull. We should examine the items and
	  ;;    ignore those we already have. If <u> is empty,
	  ;;    it means that we have already reach <maxpos>.
	  ;;    we should start pushing things after this.
	  ;;    item format in u is (:id :xhash)
	  (if (not (= pos remote-pos))
	      (error "did-ask -- pos MISMATCH"))

	  (if (not (null? pullable))
	      (error "did-ask -- pullable NOT EMPTY"))
	  
	  (set! max-remote-pos maxpos)
	  (set! asking false)

	  ;; No more
	  (when (null? u)
		(set! remote-pos max-remote-pos)
		(set! pushable-pos lastpos)
		(save-remote-pos)
		(return))

	  (set-working)

          (define got-max false)
	  ;; Collecting items we don't have into pullable
	  (dolist (x u)
		  (cond
		   [(<= x:id remote-pos)
		    ;; id must be larger than remote-pos
		    (error "Bad result")]
		   [(ss 'has-xblob? x:xhash)
                    ;; Already got it. u is sorted.
                    (set! got-max x:id)
                    ]
		   [else
		    (set! pullable (cons x pullable))]))



	  ;; If nothing new found, we should start a new round of
	  ;; asking. Otherwise send a <pull> message to host
	  ;; to initiate download of new blobs.
          (cond [(null? pullable)
                 (set! remote-pos got-max)
                 (save-remote-pos)
                 (send-ask)
                 ]
                [else
                 (set! pullable (reverse pullable))                 
                 (post-message 'pull pullable)
                 ])

	  (report-progress)
	  ]

	 [(pull u)
	  ;; This is server's response to our <push> request.
	  (dolist (x u)
		  (define xb (ss 'find-xblob x:xhash))
		  (when (not (null? xb))
			(post-message 'did-pull xb)
			(report-progress)
			(ss 'send-xblob-to-output out xb)
			(set! pushed (+ 1 pushed))))
	  (post-message 'did-pull false)
	  (set! pushable ())
	  (report-progress)
	  (send-ask)
	  ]
	 
	 [(did-pull x)
	  (if (null? pullable)
	      (error "No pullable"))
	  (if x
	      (begin
		(report-progress)
		(ss 'add-xblob-from-input in x server-instance-id)
                (set! remote-pos x:id)                
		(set! pulled (+ 1 pulled)))
	      (begin
		(set! pullable ())
		(save-remote-pos)
		(report-progress)
		(send-ask)))
	  ]

	 [(update pos)
	  (set! max-remote-pos pos)
	  ]

	 [else
	  (error "Bad message")])
  )

(defmethod (did-dispatch)
  (let loop ()
    (cond
     [(not auth)] ;; Do nothing until authenticated

     [(or asking
	  (not (null? pullable))
	  (not (null? pushable)))
      ;; Waiting for reply
      (println "waiting for reply -- " asking
	       " pullable=" pullable
	       " pushable=" pushable)
      ]

     [pushable-pos
      (find-pushable)
      (if (not (null? pushable))
	  (begin
	    (println "Found pushable -- " pushable)
	    (set-working)
	    (post-message 'push pushable-pos pushable))
	  (verbose "No pushable"))
      (set! pushable-pos false)
      (loop)]

     ;; perhaps we should put the first test before pushable
     [(or (< remote-pos max-remote-pos)
	  (> (- (time) last-ask-time) 15))
      (send-ask)]

     [else
      (set-idle)])))

(defmethod (on-request msg ack)
  (match msg
	 [(start-sync)
	  (when (and (not working) (not asking))
                ;; Force (set-idle) to report progress
                (set! last-report-time 0)
                (send-ask))
	  (ack true)]
         [(update-device-info)
          (send-device-info)]
	 [(stop)
	  (println "Stop")
	  (post-message 'bye)
	  (flush out)
	  (exit)
	  (ack true)]
	 ))

(defmethod (ready)
  (set! ss (open-space-storage args:dbpath args:dbkey))
  (apply-extension ss space-storage-sync-extension)

  (define user-uuid (ss 'get-config "creator"))
  (set! current-user (ss 'find-user user-uuid))
  (if (not (eq? (pubkey->address client-pk) user-uuid))
      (error "Creator pk mismatch"))

  (define space-uuid (ss 'get-config "space-id"))
  (define instance-id (ss 'get-config "instance-id"))
  
  ;; Client must have the shared secret.
  (set! shared-secret (string->buffer (ss 'get-config "shared-secret")))
  (define secret-check (hex-encode (sha256 shared-secret)))

  ;; Send hello message to server to establish dialog
  ;; who I am, which space I want to visit, and which instance
  ;; I am currently on.
  (post-message 'hello space-uuid instance-id secret-check))
