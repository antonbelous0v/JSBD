#include "host.h"

#include <cstdlib>
#include <string>

namespace mydb {

namespace {
void crash_point(const v8::FunctionCallbackInfo<v8::Value>& info) {
    auto configured = std::getenv("MYDB_CRASH_AT");
    if (!configured || info.Length() == 0) return;
    v8::String::Utf8Value point(info.GetIsolate(), info[0]);
    if (*point && configured == std::string(*point)) std::abort();
}
}

void install_debug(v8::Isolate* isolate, v8::Local<v8::Object> host) {
    auto context = isolate->GetCurrentContext();
    auto debug = v8::Object::New(isolate);
    debug->Set(context, v8::String::NewFromUtf8Literal(isolate, "crashPoint"), v8::Function::New(context, crash_point).ToLocalChecked()).Check();
    host->Set(context, v8::String::NewFromUtf8Literal(isolate, "debug"), debug).Check();
}

}
