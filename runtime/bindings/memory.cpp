#include "host.h"

#include <memory>

namespace mydb {

namespace {
void allocate(const v8::FunctionCallbackInfo<v8::Value>& info) {
    auto isolate = info.GetIsolate();
    auto size = info[0]->IntegerValue(isolate->GetCurrentContext()).FromMaybe(-1);
    if (size < 0) {
        isolate->ThrowException(v8::Exception::RangeError(v8::String::NewFromUtf8Literal(isolate, "Invalid allocation size")));
        return;
    }
    auto store = v8::ArrayBuffer::NewBackingStore(isolate, static_cast<std::size_t>(size));
    info.GetReturnValue().Set(v8::ArrayBuffer::New(isolate, std::move(store)));
}
}

void install_memory(v8::Isolate* isolate, v8::Local<v8::Object> host) {
    auto context = isolate->GetCurrentContext();
    auto memory = v8::Object::New(isolate);
    memory->Set(context, v8::String::NewFromUtf8Literal(isolate, "alloc"), v8::Function::New(context, allocate).ToLocalChecked()).Check();
    host->Set(context, v8::String::NewFromUtf8Literal(isolate, "memory"), memory).Check();
}

}
