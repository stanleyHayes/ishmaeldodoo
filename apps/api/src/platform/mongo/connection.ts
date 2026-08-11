import mongoose from "mongoose";

type ConnectionState = {
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongo = globalThis as typeof globalThis & {
  __amanorMongo?: ConnectionState;
};

const state = globalWithMongo.__amanorMongo ?? { promise: null };
globalWithMongo.__amanorMongo = state;

export async function connectMongo(uri: string): Promise<typeof mongoose> {
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
    return mongoose;
  }

  state.promise ??= mongoose.connect(uri, {
    autoIndex: process.env.NODE_ENV !== "production",
    bufferCommands: false,
    maxPoolSize: 20,
    minPoolSize: process.env.NODE_ENV === "production" ? 2 : 0,
    serverSelectionTimeoutMS: 5_000,
  });

  try {
    return await state.promise;
  } catch (error) {
    state.promise = null;
    throw error;
  }
}

export async function disconnectMongo(): Promise<void> {
  state.promise = null;
  await mongoose.disconnect();
}
