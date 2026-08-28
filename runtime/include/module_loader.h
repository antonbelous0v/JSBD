#pragma once

#include <string>

#include <v8.h>

namespace mydb {

class ModuleLoader {
public:
    ModuleLoader(v8::Isolate* isolate, std::string root);
    v8::MaybeLocal<v8::Module> load(v8::Local<v8::Context> context, const std::string& path);
    static v8::MaybeLocal<v8::Module> resolve(v8::Local<v8::Context> context, v8::Local<v8::String> specifier, v8::Local<v8::FixedArray> import_attributes, v8::Local<v8::Module> referrer);

private:
    v8::MaybeLocal<v8::Module> compile(v8::Local<v8::Context> context, const std::string& path);
    std::string normalize(const std::string& specifier, const std::string& referrer) const;
    v8::Isolate* isolate_;
    std::string root_;
};

}
