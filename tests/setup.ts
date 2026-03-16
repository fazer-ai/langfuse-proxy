import { GlobalRegistrator } from "@happy-dom/global-registrator";
import "@testing-library/jest-dom";

GlobalRegistrator.register();

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "test-secret-key-for-testing-only";
