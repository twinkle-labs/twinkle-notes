LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := libcrypto
LOCAL_SRC_FILES := $(LOCAL_PATH)/openssl-prebuilt/$(TARGET_ARCH_ABI)/lib/libcrypto.a
include $(PREBUILT_STATIC_LIBRARY)

include $(CLEAR_VARS)
TWKROOT := $(LOCAL_PATH)/../../../../../../../../twinkle-lisp
LOCAL_MODULE := twk
LOCAL_SRC_FILES :=\
	twk_jni.c \
	ifaddrs.c \
	$(TWKROOT)/src/twk.c \
	$(TWKROOT)/src/base58.c \
	$(TWKROOT)/src/base64.c \
	$(TWKROOT)/src/lisp_crypto.c \
	$(TWKROOT)/src/lisp_fs.c \
	$(TWKROOT)/src/lisp_socket.c \
	$(TWKROOT)/src/lisp_sqlite3.c \
	$(TWKROOT)/src/lisp_zstream.c \
	$(TWKROOT)/src/fifo.c \
	$(TWKROOT)/src/utf8.c \
	$(TWKROOT)/src/regexp.c \
	$(TWKROOT)/src/lisp_regexp.c \
	$(TWKROOT)/src/microtime.c \
	$(TWKROOT)/src/httpd.c \
	$(TWKROOT)/src/lisp.c \
	$(TWKROOT)/lib/sqlcipher/sqlite3.c

LOCAL_CFLAGS += \
	 -DSQLITE_HAS_CODEC  -DSQLITE_TEMP_STORE=3 -DSQLCIPHER_CRYPTO_OPENSSL -DSQLITE_ENABLE_FTS5 \
	-fPIC -std=c99 -Wall -D_DEFAULT_SOURCE

LOCAL_C_INCLUDES :=\
	$(TWKROOT)/src/public \
	$(TWKROOT)/lib/sqlcipher \
	$(LOCAL_PATH)/openssl-prebuilt/$(TARGET_ARCH_ABI)/include

LOCAL_STATIC_LIBRARIES := libcrypto
LOCAL_LDLIBS += -ldl -llog -lm -lz 

include $(BUILD_SHARED_LIBRARY)


