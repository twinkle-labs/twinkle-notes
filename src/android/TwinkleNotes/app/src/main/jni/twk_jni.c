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

#include <unistd.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include "twk.h"

#include <jni.h>
#include <android/log.h>
#include <pthread.h>
#include <string.h>

#define JAVA_PACKAGE_PATH app_twinkle_notes
#define JAVA_EXPORT_NAME2(name,package) Java_##package##_##name
#define JAVA_EXPORT_NAME1(name,package) JAVA_EXPORT_NAME2(name,package)
#define JAVA_EXPORT_NAME(name) JAVA_EXPORT_NAME1(name,JAVA_PACKAGE_PATH)

#define MAX_PATH 256

static int pfd[2];
static const char *tag = "twk-jni";

JNIEXPORT void JNICALL 
JAVA_EXPORT_NAME(TwinkleSystem_JNIStartLogger) ( JNIEnv * env, jobject  thiz)
{

}


JNIEXPORT jstring JNICALL 
JAVA_EXPORT_NAME(TwinkleSystem_JNIGetMessage) ( JNIEnv * env, jobject  thiz)
{
    char buf[512];
    ssize_t sz;
    __android_log_write(ANDROID_LOG_INFO, tag, "Waiting for Message");

	sz = read(pfd[0], buf, sizeof buf - 1);
    if (sz > 0) {
        if(buf[sz - 1] == '\n') --sz;
        buf[sz] = 0;  /* add null-terminator */
    } else {
	buf[0] = 0;
	}	

    __android_log_write(ANDROID_LOG_INFO, tag, "Got message");
    return (*env)->NewStringUTF(env, buf);
}

static void receive_message(void *ctx, const char* s)
{
	__android_log_write(ANDROID_LOG_INFO, tag, "receive message");
	__android_log_write(ANDROID_LOG_INFO, tag, s);
	write(pfd[1], s, strlen(s));
	write(pfd[1], "\n", 1);
}


static void console_output(void *ctx, const char *s)
{
	__android_log_write(ANDROID_LOG_INFO, tag, s);
}

JNIEXPORT void JNICALL 
JAVA_EXPORT_NAME(TwinkleSystem_JNIStart) ( JNIEnv * env, jobject  thiz)
{
	__android_log_print(ANDROID_LOG_INFO, tag, "Starting");

	pipe(pfd);

	twk_set_console_output(console_output, NULL);
	twk_set_receive_message(receive_message, NULL);
	static const char *args[] = {
		"twk", "launch", "control", "--port", ",6780"
	};
	int ret = twk_start(sizeof(args)/sizeof(args[0]), args);

	if (ret==0) {
		__android_log_print(ANDROID_LOG_INFO, tag,"Started");
	} else {
		__android_log_print(ANDROID_LOG_INFO, tag,"Failed to start");
	}
}

JNIEXPORT jint JNICALL 
JAVA_EXPORT_NAME(TwinkleSystem_JNISetDistPath) ( JNIEnv * env, jobject  thiz, jstring s)
{
	const jbyte *jstr;
	
	jstr = (*env)->GetStringUTFChars(env, s, NULL);
	if (jstr != NULL && strlen(jstr) > 0)
		twk_set_dist_path(jstr);
	(*env)->ReleaseStringUTFChars(env, s, jstr);
	return 0;
}

JNIEXPORT jint JNICALL 
JAVA_EXPORT_NAME(TwinkleSystem_JNISetVarPath) ( JNIEnv * env, jobject  thiz, jstring s)
{
	const jbyte *jstr;
	
	jstr = (*env)->GetStringUTFChars(env, s, NULL);
	if (jstr != NULL && strlen(jstr) > 0)
		twk_set_var_path(jstr);
	(*env)->ReleaseStringUTFChars(env, s, jstr);
	return 0;
}
