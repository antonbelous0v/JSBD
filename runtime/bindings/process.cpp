#include "host.h"

#include <cstdlib>
#include <unistd.h>

namespace mydb {

namespace {
void exit_process(const v8::FunctionCallbackInfo<v8::Value>& info) {
    std::exit(info.Length() ? info[0].As<v8::Int32>()->Value() : 0);
}
}

void install_process(v8::Isolate* isolate, v8::Local<v8::Object> host, const std::vector<std::string>& arguments) {
    auto context = isolate->GetCurrentContext();
    auto process = v8::Object::New(isolate);
    auto argv = v8::Array::New(isolate, arguments.size());
    for (std::size_t index = 0; index < arguments.size(); ++index) argv->Set(context, index, v8::String::NewFromUtf8(isolate, arguments[index].c_str()).ToLocalChecked()).Check();
    process->Set(context, v8::String::NewFromUtf8Literal(isolate, "argv"), argv).Check();
    process->Set(context, v8::String::NewFromUtf8Literal(isolate, "pid"), v8::Integer::New(isolate, getpid())).Check();
    process->Set(context, v8::String::NewFromUtf8Literal(isolate, "exit"), v8::Function::New(context, exit_process).ToLocalChecked()).Check();
    host->Set(context, v8::String::NewFromUtf8Literal(isolate, "process"), process).Check();
}

}
