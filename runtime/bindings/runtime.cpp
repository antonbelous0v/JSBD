#include "host.h"

namespace mydb {

namespace {
void heap_stats(const v8::FunctionCallbackInfo<v8::Value>& info) {
    auto isolate = info.GetIsolate();
    v8::HeapStatistics statistics;
    isolate->GetHeapStatistics(&statistics);
    auto context = isolate->GetCurrentContext();
    auto result = v8::Object::New(isolate);
    result->Set(context, v8::String::NewFromUtf8Literal(isolate, "used"), v8::Number::New(isolate, statistics.used_heap_size())).Check();
    result->Set(context, v8::String::NewFromUtf8Literal(isolate, "limit"), v8::Number::New(isolate, statistics.heap_size_limit())).Check();
    info.GetReturnValue().Set(result);
}

void low_memory(const v8::FunctionCallbackInfo<v8::Value>& info) { info.GetIsolate()->LowMemoryNotification(); }
}

void install_runtime(v8::Isolate* isolate, v8::Local<v8::Object> host) {
    auto context = isolate->GetCurrentContext();
    auto runtime = v8::Object::New(isolate);
    runtime->Set(context, v8::String::NewFromUtf8Literal(isolate, "heapStats"), v8::Function::New(context, heap_stats).ToLocalChecked()).Check();
    runtime->Set(context, v8::String::NewFromUtf8Literal(isolate, "lowMemoryNotification"), v8::Function::New(context, low_memory).ToLocalChecked()).Check();
    host->Set(context, v8::String::NewFromUtf8Literal(isolate, "runtime"), runtime).Check();
}

}
