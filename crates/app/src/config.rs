use clap::{Parser, ValueEnum};

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum ServoDirection {
    Normal,
    Reverse,
}

#[derive(Parser, Debug)]
pub struct Config {
    #[clap(long, env, hide_env_values = true)]
    pub api_path: String,

    #[clap(long, env, hide_env_values = true)]
    pub api_token: String,

    #[clap(long, env = "SERVO_DIRECTION", value_enum, default_value = "normal")]
    pub servo_direction: ServoDirection,
}
