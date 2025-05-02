#
# For those who uses nix-direnv, you should write 
# ```
#   use flake
#   dotenv
# ```
# in your .envrc file.
#
{
  description = "A basic flake to with flake-parts";

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
            alsa-lib
            pkg-config
            nodejs-slim
            pnpm
            # Add rust toolchain based on mise.toml configuration
            (pkgs.rust-bin.stable.latest.default.override {
              extensions = [ "rust-src" "rust-analyzer" ];
            })
          ];
        };
      };
    };
}
