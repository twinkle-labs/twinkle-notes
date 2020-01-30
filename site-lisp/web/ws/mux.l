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

;; -*- mode: Scheme; -*-
(set-process-name "ws/mux")
(define self (this))
(define user-id false)
(define client-id false) ;; <user-id>/<pid>
(define request-list ())
(define space-pid false)
(define self-addr (list (get-pid)))
(define mbox (open-mbox 65536))
(define channel-dict (dict)) ;; (<channel-name> <channe-addr>)
(define current-user false)
(define session false)
(define space-db false)

(define (websocket-init req)
  (set! session (http-get-session req))
  (if (not session)
      (error "Invalid access token"))
  (println "Session: " session)
  (define db-path (space-storage-get-path session:dbname))
  (set! space-db (open-space-storage db-path session:dbkey))
  (apply-extension space-db space-storage-ui-extension)
  )

(define (ws-send &rest x)
  (websocket-write (concat x) out)
  (flush out))

(define (make-ack req-id)
  (lambda (response)
    (ws-send 'did-request req-id response)))

(define (join-channel ch-pid)
  (send-message ch-pid `(join ,(get-pid) ,client-id)))

(define (websocket-receive msg)
  (if (not msg)
      (return false))

  (verbose "Websocket message: " msg)
  (let [(m (read (open-input-buffer (cadr msg))))]
    (match m
	   [(request req-id req-time &rest req)
	    (println "Got request:" req)
	    (define ack (make-ack req-id))
	    (match req
		   [(join-channel name)
		    (set! name (string->symbol name))
		    (if (eq? (dict-get channel-dict name) undefined)
			(send-request space-pid (list 'create-channel name user-id)
				      ^{[x]
					(if (null? x)
					    (ack false)
					    (begin
					      (dict-set! channel-dict name x)
					      (request-channel name (list 'new-member user-id self-addr)
							       ^{[x](ack true)})))
					})
			(ack true))]
		   [(channel-do name action &rest args)
		    (set! name (string->symbol name))
		    (request-channel name
				     (cons (string->symbol action)
					   args)
				     ack)]
		   [(post-channel name lkid text)
		    (set! name (string->symbol name))
		    (post-channel-message name lkid text ack)
		    ]

		   [(space action &rest args)
		    (set! action (string->symbol action))
		    (if (not (method? action space-db))
			(ack (list 'error "No such action" action))
			(ack (catch (apply space-db (cons action args)))))
		    ]
		   [(space! action &rest args)
		    (set! action (string->symbol action))
		    (if (not (method? action space-db))
			(error "No such action" action)
			(let [(x (catch (apply space-db (cons action args))))]
			  (send-message space-pid (list 'did-space-update))
			  (ack x)
			  ))
		    ]
		   [(space-do action &rest args)
		    (if (string? action)
			(set! action (string->symbol action)))
		    (send-request space-pid (cons action args) ack)
		    ]
		   [else
		    (ack (list :error "Request unsupported"))]
		   )
	    ]
	   [(notify name to &rest msg)
	    (send-notify name to msg)
	    ]
	   [(get-process-output pid)
	    (send-message pid  `(subscribe ,(get-pid) console/* 0))]
	   
	   [(hello)
	    ;; Open space indicated in the session.
	    ;; Return a list of two items,
	    ;; the first is our our membership info in that space;
	    ;; the second is the space owner info.
	    ;; Process #1 is the controlling process,
	    ;; the first process after init.
	    ;; So we are sending the request to it.
	    (send-request 1 (list 'join-space (get-pid) session:space session:dbname session:dbkey)
			  ^{[x]
			    (println "Did join-space: " x)
			    (if (null? x)
				(error "Bad space"))
			    (set! space-pid (car x))
			    (send-message space-pid (list 'register-mux (get-pid)))
			    (define s (cadr x))
			    (define u (caddr x))
			    (set! current-user u)
			    (define name (nth x 3)) ;; release space name
			    (set! user-id (cdr (assoc 'uuid u)))
			    (set! client-id (concat user-id "/" (get-pid)))
			    (ws-send 'did-hello client-id (get-pid) (list u s name))
			    })]
	   
	   [(keep-alive)
	    true]
	   [(send-command pid cmd)
	    (send-message pid  `(ucmd ,cmd))])
    ))

(defmethod (send-command pid cmd)
  (send-message pid  `(ucmd ,cmd))
  )

(define (request-channel name msg ack)
  (define addr (dict-get channel-dict name))
  (when (eq? addr undefined)
        (println "bad channel:" name)
        (return false))
  (if (null? (cdr addr))
      (send-request (car addr) msg ack)
      false ;; TODO xchannel
      )
  )

;; Send a notification to channel members
(define (send-notify name to msg)
  (define addr (dict-get channel-dict name))
  (when (eq? addr undefined)
        (println "notify-channel: bad channel:" name)
        (return false))
  (if (null? (cdr addr))
      (send-message (car addr) `(notify ,user-id ,to ,@msg))
      false ;; TODO xchannel
      )
  )

(define (post-channel-message name lkid text ack)
  (when (not (integer? lkid))
        (println "bad lkid")
        (return))
  (when (> (string-length text) 4000)
        (println "bad text: too long, max=4000")
        (return))
  (request-channel name (list 'post user-id self-addr lkid text) ack)
  )

;; Notification from channel
;; to is ignored. It's our address
(defmethod (channel-notify channel-name from to msg)
  (ws-send 'on-notify channel-name (cons from msg)))

(defmethod (dispatch event &rest message)
  (ws-send 'on-notify event message))
