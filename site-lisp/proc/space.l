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

(define self (this))
(println "Starting space: " args)

(define name (car args)) ;;filename
(define dbkey (cadr args))
(define dbpath (space-storage-get-path name))
(define sstore (open-space-storage dbpath dbkey))
(apply-extension sstore space-storage-process-extension)
(apply-extension sstore space-storage-ui-extension)
(define space-uuid (sstore 'get-space-uuid))
(define mux-list ())
(define latest-chat-log-id (sstore 'get-latest-chat-log-id))
(define latest-note-log-id (sstore 'get-latest-note-log-id))
(define latest-profile-log-ctime (sstore 'get-latest-profile-log-ctime))

(defmethod (register-mux pid)
  (set! mux-list (cons pid mux-list)))

(define (notify-mux msg)
  (let loop [(u mux-list) (v ())]
    (if (null? u)
	(set! mux-list v)
	(if (send-message (car u) (cons 'dispatch msg))
	    (loop (cdr u) (cons (car u) v))
	    (loop (cdr u) v)))))


(defmethod (add-user name uuid1 pk role)
  (set! pk (base64-decode pk))
  (define uuid (pubkey->address pk))

  (define x (catch
	     (if (not (eq? (string-find uuid uuid1) 0))
		 (error "Bad uuid"))
	     (sstore 'add-user name uuid (hex-encode pk))
	     (sstore 'set-user-role uuid role)
	     uuid))
  (did-space-update)
  x)

(defmethod (get-shared-secret)
  (sstore 'get-config 'shared-secret)
  )

(defmethod (generate-invitation uuid)
  (define s (sstore 'find-user space-uuid))
  (define u (sstore 'find-user uuid))
  (if (or (null? u)
	  (not (eq? u:role 2)))
      (list :error "Invalid user"))
  (define ts (time))
  (define iv (sha256 (concat ts)))
  (define key (ecdh (car (sstore 'get-creator-keypair))
		    (hex-decode u:pk)))
  (define d (list
	     :secret (sstore 'get-config 'shared-secret)
	     :name s:name
	     :pk s:pk
	     :uuid space-uuid))

  (define x (encrypt (concat d) "aes-256-cbc" key iv))
  (list :ts ts
	:xstr (base64-encode x))
  )

(defmethod (decode-invitation uuid xstr ts)
  (define u (sstore 'find-user uuid))
  (if (or (null? u)
	  (eq? u:pk undefined))
      (return (list :error "Invalid sender")))
  (define iv (sha256 ts))
  (define key (ecdh (car (sstore 'get-creator-keypair))
		    (hex-decode u:pk)))
  (define d (read (open-input-buffer (decrypt (base64-decode xstr) "aes-256-cbc" key iv))))
  d
  )

(defmethod (get-space-info)
  (append (sstore 'get-space-info) (list name)))

(defmethod (set-chat-read hash)
  (sstore 'set-chat-read hash))

(defmethod (get-contact-info uuid)
  (define x (sstore 'find-user uuid))
  (cons (cons 'pk64 (base64-encode (hex-decode x:pk))) x))

;; Fuzzy 
(defmethod (query-user s)
  (sstore 'find-user* s)
  )

(defmethod (set-host-info uuid type host ip port contractno)
  (sstore 'set-host uuid host ip port type contractno))

;; Get Syncing status.
;; - instance id
;; - current remote position (how many blobs are synced)
;; - last time synced
;;
(defmethod (get-sync-info)
  (define i (sstore 'get-config 'host-instance))
  (define h (sstore 'get-user-host space-uuid))
  (if i 
      (list
       :instance i
       :hostid h:uuid
       :pid (and sync-pid (process-exists? sync-pid) sync-pid)
       :remotePos (sstore 'get-config "server-\{i}:remote-pos")
       :lastSynced (sstore 'get-config "server-\{i}:last-synced"))))

(defmethod (get-secret)
  (sstore 'get-config 'shared-secret)
  )

(defmethod (set-device-info token type)
  (define curr-token (sstore 'get-config 'device-token))
  (define curr-type (sstore 'get-config 'device-type))
  (if (and (eq? curr-token token) (eq? curr-type type))
      (return))
  (sstore 'set-config 'device-token token)
  (sstore 'set-config 'device-type type)
  (when (has-sync-process?)
	(send-request sync-pid (list 'update-device-info) ^{[x]}))
  )

(defmethod (get-current-user-vk)
  (hex-encode (car (sstore 'get-creator-keypair))))

(define (do-init-host ack)
  (define h (sstore 'get-user-host space-uuid))
  (define secret (sstore 'get-config 'shared-secret))
  (define secret-check (hex-encode (sha256 secret)))
  (println "Init host " space-uuid " " h)
  (start-rexec
   h:uuid h:ip h:port
   (sstore 'get-creator-keypair)
   (list "spacex" 'create h:contract secret-check)
   ^{[x]
     (if (string? x)
	 (sstore 'set-config "\{h:uuid}/instance" x))
     (ack x)
     }))

(define (do-find-host uuid ack)
  (define u (sstore 'find-user uuid))
  (cond
   [(not registry-host)
    (ack (list 'error "Registry host info not found"))]
   [else
    (request-registry
     (list 'lookup uuid)
     ^{[y]
       (if (and (pair? y) (assoc 'uuid y))
	   (begin ;; lookup success
	     (println "Lookup:" y)
	     (if (not (null? u))
		 (sstore 'set-host u:id y:uuid y:ip y:port "hub"
			 (and (assoc 'contractno y) y:contractno)))
	     (ack y))
	   (begin ;; lookup failed
	     (ack y)))
       })]))

(define (request-registry req ack)
    (if (not registry-host)
      (ack ()))
    (start-rexec registry-uuid
		 registry-host
		 registry-port
		 (sstore 'get-creator-keypair)
		 (cons "registry" req)
		 ^{[x]
		   (println "request registry: " req "=>" x)
		   (ack x)}))


;;------------------------------------------------------------
;; Blob Post
;;------------------------------------------------------------
(define post-pid false)
(define post-rcpt false)

(define (spawn-blob-post rcpt host ip port)
  ;; To make things simpler,
  ;; only one post process is allowed  
  (if post-pid (return))
  (set! post-rcpt rcpt)
  (set! post-pid (spawn start-peer (list host ip port
			  (sstore 'get-creator-keypair)
			  "blob-post"
			  :name name ;; space db name
			  :rcpt rcpt
			  :blobs (sstore 'list-postable rcpt)
			  :dbpath dbpath
			  :dbkey dbkey))))

;; Messages from blob post process
(defmethod (on-blob-post &rest msg)
  (match msg
	 [(completed pid rcpt blobs)
	  (println "Posted to " rcpt)
	  (if (eq? pid post-pid)
	      (set! post-pid false))
	  (sstore 'set-posted rcpt blobs)
	  (sstore 'clear-host-retry rcpt)
	  (start-post)]
	 [(failed pid rcpt)
	  (println "Failed to post to " rcpt)
	  (if (= pid post-pid)
	      (set! post-pid false))
	  (start-post)]
	 ))

(define (start-post)
  ;; Do not proceed if a post process already exists
  (if (and post-pid (process-exists? post-pid))
      (return))
  (if post-pid ;; previous post didn't end well
      (set! post-pid false))

  (define x (sstore 'next-blobpost))
  (when (null? x) ;; No work to do
	(println "No available blobpost")
	(notify-mux (list 'did-post (sstore 'count-unsent-total)))
	(return))

  (if (eq? x:type undefined) ;; host entry doesn't exist
      ;; create empty one to track
      ;; retry interval
      (sstore 'set-host x:uid () () ()))

  ;; Be defensive. Always assume we are going to fail
  ;; Retry will be cleared upon a successful post
  (sstore 'inc-host-retry x:rcpt)
  
  (cond
   [(eq? x:type "manual") ;; Manual host entry, always do it
    (spawn-blob-post x:rcpt x:host x:ip x:port)]

   [(or (eq? x:host undefined) (not (eq? x:retry undefined)))
    ;; No host or retry is required
    (request-registry
     (list 'lookup x:rcpt)
     ^{[y]
       (if (assoc 'uuid y)
	   (begin ;; lookup success
	     (sstore 'set-host x:uid y:uuid y:ip y:port)
	     (spawn-blob-post x:rcpt y:uuid y:ip y:port))
	   (begin ;; lookup failed
	     (start-post))
	   )})]
   [else
    ;; Host valid and retry is cleared
    (spawn-blob-post x:rcpt x:host x:ip x:port)]))

(defmethod (get-post-status)
  (list
   ;; pid
   (if (and post-pid (process-exists? post-pid)) post-pid false)
   post-rcpt
   (sstore 'count-unsent)
   )
  )

(defmethod (start-posting &optional uuid)
  (sstore 'clear-host-retry uuid)
  (start-post)
  )

;;------------------------------------------------------------

(define sync-pid false)
(define sync-status ())
(define sync-retry-time false)
(define sync-retry-count 0)
(define sync-should-retry false)

(define (has-sync-process?)
  (and sync-pid (process-exists? sync-pid)))

(define (spawn-blob-sync uuid ip port)
  (spawn start-peer
	 (list uuid ip port
	       (sstore 'get-creator-keypair)
	       "blob-sync"
	       :space-uuid space-uuid
	       :dbpath dbpath
	       :dbkey dbkey)))

;; 
(define (do-sync ack &optional force)
  (when (has-sync-process?)
	(send-request sync-pid (list 'start-sync) ^{[x]})
	(return (ack (list :pid sync-pid))))
  (set! sync-pid false)
  (define h (sstore 'get-user-host space-uuid))
  (if (and (not (eq? h:retry undefined))
	   (> h:retry (time))
	   (not force))
      (return (ack (list 'error "Retry later"))))

  ;; Before we modify retry 
  (define should-lookup-host
    (or (eq? h:uuid undefined)
	(not (eq? h:retry undefined))))

  ;; No lookup Manual host 
  (if (eq? h:type "manual")
      (set! should-lookup-host false))
  
  ;; Be defensive. Always assume we are going to fail
  ;; Retry will be cleared upon a successful post
  (if force
      (sstore 'clear-host-retry space-uuid))
  (sstore 'inc-host-retry space-uuid)

  ;; If host info not exists, look up now
  (when should-lookup-host
      (do-find-host space-uuid
		    ^{[x]
		      (if (and (pair? x) (assoc 'uuid x))
			  (begin
			    (if (not (eq? x:uuid h:uuid))
				(sstore 'remove-config 'host-instance))
			    (sstore 'clear-host-retry space-uuid)
			    (do-sync ack))
			  (ack (list 'error "Lookup host" h:uuid x)))
		      })
      (return))

  ;; If we are not the space owner, do not try to init host
  ;; since we won't be able to
  (define i)
  (if (eq? sstore:current-user space-uuid)
      (set! i (sstore 'get-config "\{h:uuid}/instance")))
  (when (not i)
	(do-init-host ^{[x]
			(if (string? x)
			    (begin
			      (sstore 'clear-host-retry space-uuid)    
			      (do-sync ack))
			    (ack x))})
	(return))
  
  (define secret (sstore 'get-config 'shared-secret))
  (if (not secret)
      (return (ack (list 'error "Missing secret"))))

  ;; Since we have gone this far
  (set! sync-should-retry true)

  (if (not sync-pid)
      (set! sync-pid (spawn-blob-sync h:uuid h:ip h:port)))
  (ack (list :pid sync-pid)))

(define (start-sync &optional force)
  (do-sync ^{[x]
             (println "start-sync -- " x)
	     } force))

(defmethod (did-space-update)
  ;; Called after local edits
  (start-post)
  (start-sync))

(define (make-sync-status)
  (if (has-sync-process?)
      (cons :pid sync-pid
	    (if (null? sync-status) (list :starting true) sync-status))
      ()))

(defmethod (get-sync-status)
  (make-sync-status))

(defmethod (on-space-sync &rest msg)
  (match msg
	 [(progress status)
	  (set! sync-status status)
	  (notify-mux (list 'on-sync-progress (make-sync-status)))
	  ]
	 [(updated)
	  (println "Space Sync updated")
	  (sstore 'clear-host-retry space-uuid)	  
	  (sstore 'process-blobs)
	  ;; Check if there is new chats, if so
	  ;; we should redirect to the mux
	  (let [(x latest-chat-log-id)
		(y latest-note-log-id)
		(z latest-profile-log-ctime)]

	    (set! latest-chat-log-id (sstore 'get-latest-chat-log-id))
	    (set! latest-note-log-id (sstore 'get-latest-note-log-id))
	    (set! latest-profile-log-ctime (sstore 'get-latest-profile-log-ctime))
	    (if (not (eq? x latest-chat-log-id))
		(notify-mux (list 'on-new-chat)))
	    (if (not (eq? y latest-note-log-id))
		(notify-mux (list 'did-update-notes)))
	    (if (not (eq? z latest-profile-log-ctime))
		(begin
		  (start-posting)
		  (notify-mux (list 'did-update-profile)))
		)
	    )
	  ]
	 ))

(defmethod (timeout)
  ;; Gone clients will be removed if can't be notified
  (notify-mux (list 'keep-alive))
  
  (cond [(null? mux-list)
         (if (has-sync-process?)
             (send-request sync-pid (list 'stop) ^{[x]}))
         ;; TODO DON'T QUIT JUST YET.
         ;; Too many complications.
         ;;(send-message (get-parent-pid) (list 'did-space-exit (get-pid)))
         ;;(exit)
         ]
        [(not (has-sync-process?))
         (if sync-should-retry
             (if (not sync-retry-time)
                 (begin
                   (set! sync-retry-time (+ (time) 10))
                   (set! sync-retry-count 0))
                 (if (<= sync-retry-time (time))
                     (begin
                       ;; If we have retried 3 times,
                       ;; set wait interval as an hour
                       (define interval
                         (if (>= sync-retry-count 3)
                             3600
                             (floor (* (exp sync-retry-count) 30))))
                       (set! sync-retry-time (+ (time) interval))
                       (set! sync-retry-count (+ sync-retry-count 1))
                       (println "Sync retry #" sync-retry-count " interval=" interval)
                       (start-sync true)))))
         ]
        [else
          ;; We are syncing ok, reset sync-retry-time
          (set! sync-retry-time false)
         ])
  (set-timeout 30))

(defmethod (send-to-console type x)
  (notify-mux (list 'console type x)))

(defmethod (on-child-abort pid x)
  (send-to-console 'error "child #\{pid}: \{x}"))

(defmethod (reprocess-all)
  (sstore 'reprocess-all))

(defmethod (on-request msg ack)
  (match msg
	 [(find-host uuid)
	  (do-find-host uuid ack)
	  ]
	 
	 [(init-host)
	  (do-init-host ack)
	  ]

	 [(host-do host-uuid ip port method &rest args)
	  (start-rexec
	   host-uuid ip port
	   (sstore 'get-creator-keypair)
	   `("spacex" ,(string->symbol method) ,@args)
	   ^{[x]
	     (ack x)
	     })]

	 [(registry-do method &rest args)
	  (request-registry
	   (cons (string->symbol method) args)
	   ack)]

	 [(redeem-token token)
	  (request-registry
	   (list 'redeem-token token)
	   ^{[x]
	     (ack x)
	     })]

	 [(start-sync &optional force)
	  (do-sync ack force) ;; force sync
	  ]
	 [(stop-sync)
	  (if (has-sync-process?)
	      (send-request sync-pid (list 'stop) ^{[x] (ack x)})
	      (ack true))
	  ]
         [else
          (if (method? (car msg) self)
              (ack (apply self msg)))]))

;;----------------------------------------------------------------------
;; Initialization
;;----------------------------------------------------------------------

;; TODO delete unreferenced blobs
(sstore 'process-blobs)
;; Start syncing
(start-sync true)
(set-timeout 30)
