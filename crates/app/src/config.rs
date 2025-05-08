use clap::Parser;

#[derive(Parser, Debug)]
pub struct Config {
    #[clap(long, env, hide_env_values = true)]
    pub api_path: String,

    #[clap(long, env, hide_env_values = true)]
    pub api_token: String,

    #[clap(long, env, hide_env_values = true)]
    pub servo_pin: u8,

    #[clap(long, env, hide_env_values = true)]
    pub ir_pin: u16,
}
