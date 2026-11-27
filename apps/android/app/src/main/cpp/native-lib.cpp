// JNI bridge that starts Node.js (nodejs-mobile) inside the app process.
// Based on the nodejs-mobile Android sample: Node needs its arguments in one contiguous buffer,
// and its stdout/stderr are piped to logcat so server logs are visible with `adb logcat`.
#include <jni.h>
#include <android/log.h>
#include <pthread.h>
#include <unistd.h>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "node.h"

namespace {

const char *kTag = "MarqueeNode";
int pipeStdout[2];
int pipeStderr[2];

void *pump(void *arg) {
    const bool isErr = arg != nullptr;
    int fd = isErr ? pipeStderr[0] : pipeStdout[0];
    char buf[4096];
    ssize_t n;
    while ((n = read(fd, buf, sizeof buf - 1)) > 0) {
        if (buf[n - 1] == '\n') --n;
        buf[n] = 0;
        __android_log_write(isErr ? ANDROID_LOG_ERROR : ANDROID_LOG_INFO, kTag, buf);
    }
    return nullptr;
}

void redirectOutput() {
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    if (pipe(pipeStdout) == 0) dup2(pipeStdout[1], STDOUT_FILENO);
    if (pipe(pipeStderr) == 0) dup2(pipeStderr[1], STDERR_FILENO);
    pthread_t out, err;
    if (pthread_create(&out, nullptr, pump, nullptr) == 0) pthread_detach(out);
    if (pthread_create(&err, nullptr, pump, reinterpret_cast<void *>(1)) == 0) pthread_detach(err);
}

}  // namespace

extern "C" JNIEXPORT jint JNICALL
Java_app_marquee_NodeRuntime_startNode(JNIEnv *env, jclass, jobjectArray arguments) {
    const jsize count = env->GetArrayLength(arguments);

    // Copy every argument into one contiguous, NUL-separated buffer, as libuv expects.
    std::vector<std::string> copies;
    size_t total = 0;
    for (jsize i = 0; i < count; i++) {
        auto jstr = static_cast<jstring>(env->GetObjectArrayElement(arguments, i));
        const char *chars = env->GetStringUTFChars(jstr, nullptr);
        copies.emplace_back(chars);
        env->ReleaseStringUTFChars(jstr, chars);
        env->DeleteLocalRef(jstr);
        total += copies.back().size() + 1;
    }
    char *buffer = static_cast<char *>(calloc(total, sizeof(char)));
    std::vector<char *> argv(count);
    char *cursor = buffer;
    for (jsize i = 0; i < count; i++) {
        memcpy(cursor, copies[i].c_str(), copies[i].size());
        argv[i] = cursor;
        cursor += copies[i].size() + 1;
    }

    redirectOutput();
    return static_cast<jint>(node::Start(count, argv.data()));
}
