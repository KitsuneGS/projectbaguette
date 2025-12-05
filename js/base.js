// Handles correct paths for GitHub Pages vs Localhost

export const BASE =
  location.hostname.includes("github.io") ? "/projectbaguette" : "";

// ELEMENTS
export const canvas = document.getElementById("game");
export const ctx = canvas.getContext("2d");
export const mv = document.getElementById("mv");
export const audio = document.getElementById("song");
