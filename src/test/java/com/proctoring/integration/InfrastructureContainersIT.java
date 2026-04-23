package com.proctoring.integration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Tag("integration")
class InfrastructureContainersIT {

    @Test
    void requiredInfrastructureContainersCanStart() {
        DockerImageName kafkaImage = DockerImageName.parse("confluentinc/cp-kafka:7.7.1")
                .asCompatibleSubstituteFor("confluentinc/cp-kafka");

        try (
                PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
                GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
                KafkaContainer kafka = new KafkaContainer(kafkaImage)
        ) {
            postgres.start();
            redis.start();
            kafka.start();

            assertThat(postgres.isRunning()).isTrue();
            assertThat(redis.isRunning()).isTrue();
            assertThat(kafka.isRunning()).isTrue();
        }
    }
}
