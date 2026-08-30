#include "host.h"

#include <chrono>

namespace mydb {

namespace {
void monotonic(const v8::FunctionCallbackInfo<v8::Value>& info) {
    auto value = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
    info.GetReturnValue().Set(v8::BigInt::New(info.GetIsolate(), value));
}

void unix_time(const v8::FunctionCallbackInfo<v8::Value>& info) {
    auto value = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
    info.GetReturnValue().Set(v8::BigInt::New(info.GetIsolate(), value));
}
}

void install_time(v8::Isolate* isolate, v8::Local<v8::Object> host) {
    auto context = isolate->GetCurrentContext();
    auto time = v8::Object::New(isolate);
    time->Set(context, v8::String::NewFromUtf8Literal(isolate, "monotonicNs"), v8::Function::New(context, monotonic).ToLocalChecked()).Check();
    time->Set(context, v8::String::NewFromUtf8Literal(isolate, "unixNs"), v8::Function::New(context, unix_time).ToLocalChecked()).Check();
    host->Set(context, v8::String::NewFromUtf8Literal(isolate, "time"), time).Check();
}

}
