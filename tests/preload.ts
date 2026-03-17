import config from "@/config";

// Disable Langfuse during tests to prevent test traces polluting real data
config.langfusePublicKey = "";
config.langfuseSecretKey = "";
