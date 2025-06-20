#
# For those who uses nix-direnv, you should write 
# ```
#   use flake
#   dotenv
# ```
# in your .envrc file.
#
{
  description = "A basic flake using flake-parts";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    systems.url = "github:nix-systems/default";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ self, systems, nixpkgs, flake-parts, rust-overlay, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = import inputs.systems;
      perSystem = { config, pkgs, system, ... }: {
        # Add rust-overlay to the package set
        _module.args.pkgs = import nixpkgs {
          inherit system;
          overlays = [
            rust-overlay.overlays.default
          ];
        };

        # run `nix develop` or `direnv allow` to enter the development shell
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            # System-specific dependencies
            (lib.optional (!stdenv.isDarwin) alsa-lib)

            # Common dependencies
            pkg-config
            rustup
            # Build cross from source using cargo install
            (pkgs.writeShellScriptBin "cross" ''
              export PATH="$HOME/.cargo/bin:$PATH"
              if [ ! -f "$HOME/.cargo/bin/cross" ]; then
                cargo install cross --git https://github.com/cross-rs/cross.git --rev 9e2298e17170655342d3248a9c8ac37ef92ba38f
              fi
              exec "$HOME/.cargo/bin/cross" "$@"
            '')
            nodejs-slim
            pnpm
            docker
            # Add rust toolchain based on mise.toml configuration
            (rust-bin.stable."1.86.0".default.override {
              extensions = [ "rust-src" "rust-analyzer" ];
              targets = [ "aarch64-unknown-linux-gnu" ];
            })
          ];

          # FIXME: cross needs rustup
          shellHook = ''
            export PATH="${pkgs.rustup}/bin:$HOME/.cargo/bin:$PATH"
            
            # Initialize rustup if not already done
            if [ ! -d "$HOME/.rustup" ]; then
              rustup-init -y --no-modify-path
            fi
          '';
        };
      };
    };
}
