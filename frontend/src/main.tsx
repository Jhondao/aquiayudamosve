import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { GuestContactProvider } from "./context/GuestContactContext";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <GuestContactProvider>
          <App />
        </GuestContactProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
