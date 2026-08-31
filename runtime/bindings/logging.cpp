#include "host.h"

#include <iostream>

namespace mydb {

namespace {
void log(const v8::FunctionCallbackInfo<v8::Value>& info) {
    auto level = info.Data().As<v8::String>();
    v8::String::Utf8Value level_text(info.GetIsolate(), level);
    std::clog << '[' << (*level_text ? *level_text : "INFO") << "]";
    for (int index = 0; index < info.Length(); ++index) {
        v8::String::Utf8Value value(info.GetIsolate(), info[index]);
        std::clog << ' ' << (*value ? *value : "");
    }
    std::clog << '\n';
}
}

void install_logging(v8::Isolate* isolate, v8::Local<v8::Object> host) {
    auto context = isolate->GetCurrentContext();
    auto logging = v8::Object::New(isolate);
    for (auto level : {"trace", "debug", "info", "warn", "error"}) {
        auto name = v8::String::NewFromUtf8(isolate, level).ToLocalChecked();
        logging->Set(context, name, v8::Function::New(context, log, name).ToLocalChecked()).Check();
    }
    host->Set(context, v8::String::NewFromUtf8Literal(isolate, "log"), logging).Check();
}

}
