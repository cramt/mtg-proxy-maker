{
  description = "MTG Proxy Maker - Declarative CLI for generating proxy card PDFs";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_22
            chromium
          ];

          shellHook = ''
            export PLAYWRIGHT_CHROMIUM_PATH="${pkgs.chromium}/bin/chromium"
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
          '';
        };
      });
}
