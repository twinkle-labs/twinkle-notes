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
;; blob-post.l -- Post blobs to a hosted space
;; (C) 2019, Twinkle Labs, LLC
;; args:
;; - name: the space database name (not necessarily same as real space uuid)
;; - encryption-key: the key we can use to open the database file
;; - blobs: the hashes of the blobs we are going to send
;; - rcpt: the receiver of the blobs.
;;
;; How it works
;;
;; On connection ready, our client sends out a (hello <rcpt>) message, to announce
;; that it is going to post blobs to <rcpt>. If the client is on the <rcpt>'s
;; contact list, it will receive a (welcome) message, and can proceed
;; by sending a list of blob hashes to the server.
;; The server will examine the list, and echo back only those absent on the server.
;; And the client must only push those absent blobs to server.
;; Pushing an already existing blob to the server may result in being disconnected.
;; After pushing the blob list, the client should send the list of pushed blobs to the server
;; to check again. This time, the server should reply with an empty list to indicate
;; that all blobs are successfully posted.
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; FIXME we should not create an instance of Space Storage just to send
;; a message. Perhaps there is more economic way.
(define ss)
(define shared-secret)
(define space-uuid false)

(defmethod (dispatch-message x)
  (match x
	 [(welcome)
	  (post-message  'ask args:blobs)
	  ]

	 [(did-ask u)
	  (if (or (null? u) (not (list? u))) ;; No more , Done
	      (begin
		(send-message (get-parent-pid)
			      (list 'on-blob-post
				    'completed
				    (get-pid)
				    args:rcpt
				    args:blobs))
		(post-message 'bye)
		(exit)
		(return false)))
	  (define v ())
	  (dolist (hash u)
		  (define x (ss 'find-postable hash))
		  (when (null? x)
			(println "Blob not found:" hash)
			(return))
		  ;; Making x compatible with a xblob info
		  (set! x (cons (cons 'creator space-uuid) x))
		  (post-message 'push x)
		  (ss 'send-xblob-to-output out x)
		  (set! v (cons hash v))
		  )
	  (post-message 'ask v)
	  ]

         [(bye &optional err)
          (if err
              (error "Posting to" args:rcpt (cdr err)))
          (exit)
          false
          ]
	 
	 [else
	  (send-message (get-parent-pid)
			(list 'on-blob-post
			      'failed
			      (get-pid)
			      args:rcpt))
	  (error "Bad message")])
  )

(defmethod (ready)
  (set! ss (open-space-storage args:dbpath args:dbkey))
  (set! space-uuid (ss 'get-space-uuid))

  (if (not (eq? space-uuid (ss 'get-config 'creator)))
      (error "Not space owner"))

  ;;  current user and shared secret
  (set! shared-secret (ecdh (car (ss 'get-creator-keypair))
			    (hex-decode (ss 'get-pk args:rcpt))))
  (post-message 'hello args:rcpt args:blobs)
  )
