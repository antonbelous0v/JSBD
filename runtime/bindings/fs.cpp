#include "host.h"

#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <filesystem>
#include <stdexcept>
#include <sys/stat.h>
#include <unistd.h>

namespace mydb {

namespace {
std::string text(v8::Isolate* isolate, v8::Local<v8::Value> value) {
    v8::String::Utf8Value result(isolate, value);
    return *result ? *result : "";
}

void fail(v8::Isolate* isolate, const std::string& operation) {
    isolate->ThrowException(v8::Exception::Error(v8::String::NewFromUtf8(isolate, (operation + ": " + std::strerror(errno)).c_str()).ToLocalChecked()));
}

void method(v8::Isolate* isolate, v8::Local<v8::Object> object, const char* name, v8::FunctionCallback callback) {
    auto context = isolate->GetCurrentContext();
    object->Set(context, v8::String::NewFromUtf8(isolate, name).ToLocalChecked(), v8::Function::New(context, callback).ToLocalChecked()).Check();
}

void open_file(const v8::FunctionCallbackInfo<v8::Value>& info) {
    auto isolate = info.GetIsolate();
    auto path = text(isolate, info[0]);
    auto flags = info[1]->Int32Value(isolate->GetCurrentContext()).FromMaybe(0);
    auto fd = ::open(path.c_str(), flags, 0644);
    if (fd < 0) return fail(isolate, "open");
    info.GetReturnValue().Set(fd);
}

void close_file(const v8::FunctionCallbackInfo<v8::Value>& info) {
    if (::close(info[0].As<v8::Int32>()->Value()) < 0) fail(info.GetIsolate(), "close");
}

void pread_file(const v8::FunctionCallbackInfo<v8::Value>& info) {
    auto isolate = info.GetIsolate();
    auto view = info[1].As<v8::ArrayBufferView>();
    auto store = view->Buffer()->GetBackingStore();
    auto offset = view->ByteOffset() + info[2]->IntegerValue(isolate->GetCurrentContext()).FromMaybe(0);
    auto length = info[3]->IntegerValue(isolate->GetCurrentContext()).FromMaybe(0);
    auto file_offset = info[4]->IntegerValue(isolate->GetCurrentContext()).FromMaybe(0);
    auto read = ::pread(info[0].As<v8::Int32>()->Value(), static_cast<char*>(store->Data()) + offset, length, file_offset);
    if (read < 0) return fail(isolate, "pread");
    info.GetReturnValue().Set(static_cast<double>(read));
}

void pwrite_file(const v8::FunctionCallbackInfo<v8::Value>& info) {
    auto isolate = info.GetIsolate();
    auto view = info[1].As<v8::ArrayBufferView>();
    auto store = view->Buffer()->GetBackingStore();
    auto offset = view->ByteOffset() + info[2]->IntegerValue(isolate->GetCurrentContext()).FromMaybe(0);
    auto length = info[3]->IntegerValue(isolate->GetCurrentContext()).FromMaybe(0);
    auto file_offset = info[4]->IntegerValue(isolate->GetCurrentContext()).FromMaybe(0);
    auto written = ::pwrite(info[0].As<v8::Int32>()->Value(), static_cast<char*>(store->Data()) + offset, length, file_offset);
    if (written < 0) return fail(isolate, "pwrite");
    info.GetReturnValue().Set(static_cast<double>(written));
}

void sync_file(const v8::FunctionCallbackInfo<v8::Value>& info) {
    if (::fsync(info[0].As<v8::Int32>()->Value()) < 0) fail(info.GetIsolate(), "fsync");
}

void data_sync_file(const v8::FunctionCallbackInfo<v8::Value>& info) {
    if (::fdatasync(info[0].As<v8::Int32>()->Value()) < 0) fail(info.GetIsolate(), "fdatasync");
}

void truncate_file(const v8::FunctionCallbackInfo<v8::Value>& info) {
    auto context = info.GetIsolate()->GetCurrentContext();
    if (::ftruncate(info[0].As<v8::Int32>()->Value(), info[1]->IntegerValue(context).FromMaybe(0)) < 0) fail(info.GetIsolate(), "truncate");
}

void file_size(const v8::FunctionCallbackInfo<v8::Value>& info) {
    struct stat status {};
    if (::fstat(info[0].As<v8::Int32>()->Value(), &status) < 0) return fail(info.GetIsolate(), "size");
    info.GetReturnValue().Set(static_cast<double>(status.st_size));
}

void rename_file(const v8::FunctionCallbackInfo<v8::Value>& info) {
    if (::rename(text(info.GetIsolate(), info[0]).c_str(), text(info.GetIsolate(), info[1]).c_str()) < 0) fail(info.GetIsolate(), "rename");
}

void unlink_file(const v8::FunctionCallbackInfo<v8::Value>& info) {
    if (::unlink(text(info.GetIsolate(), info[0]).c_str()) < 0) fail(info.GetIsolate(), "unlink");
}

void exists_file(const v8::FunctionCallbackInfo<v8::Value>& info) {
    info.GetReturnValue().Set(std::filesystem::exists(text(info.GetIsolate(), info[0])));
}

void make_directory(const v8::FunctionCallbackInfo<v8::Value>& info) {
    std::error_code error;
    auto created = std::filesystem::create_directories(text(info.GetIsolate(), info[0]), error);
    if (error) return fail(info.GetIsolate(), "mkdir");
    info.GetReturnValue().Set(created);
}
}

void install_fs(v8::Isolate* isolate, v8::Local<v8::Object> host) {
    auto context = isolate->GetCurrentContext();
    auto fs = v8::Object::New(isolate);
    method(isolate, fs, "open", open_file);
    method(isolate, fs, "close", close_file);
    method(isolate, fs, "pread", pread_file);
    method(isolate, fs, "pwrite", pwrite_file);
    method(isolate, fs, "fsync", sync_file);
    method(isolate, fs, "fdatasync", data_sync_file);
    method(isolate, fs, "truncate", truncate_file);
    method(isolate, fs, "size", file_size);
    method(isolate, fs, "rename", rename_file);
    method(isolate, fs, "unlink", unlink_file);
    method(isolate, fs, "exists", exists_file);
    method(isolate, fs, "mkdir", make_directory);
    fs->Set(context, v8::String::NewFromUtf8Literal(isolate, "O_RDONLY"), v8::Integer::New(isolate, O_RDONLY)).Check();
    fs->Set(context, v8::String::NewFromUtf8Literal(isolate, "O_RDWR"), v8::Integer::New(isolate, O_RDWR)).Check();
    fs->Set(context, v8::String::NewFromUtf8Literal(isolate, "O_CREAT"), v8::Integer::New(isolate, O_CREAT)).Check();
    host->Set(context, v8::String::NewFromUtf8Literal(isolate, "fs"), fs).Check();
}

}
